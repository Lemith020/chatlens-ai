const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Vue = require('vue');
const { parse } = require('@vue/compiler-sfc');
const { compile } = require('@vue/compiler-dom');
const { renderToString } = require('@vue/server-renderer');
const source = fs.readFileSync(path.resolve(__dirname, '../src/App.vue'), 'utf8');
const { descriptor } = parse(source);
const render = new Function('Vue', compile(descriptor.template.content, { mode: 'function', prefixIdentifiers: true }).code)(Vue);
const snapshot = () => [{ groupId: '123@g.us', groupName: 'Synthetic', messages: [{ id: 'm1', body: '<img src=x onerror=alert(1)>', groupId: '123@g.us', timestamp: 1, type: 'chat', fromMe: false }], history: { reason: 'scan_limit', scanned: 1, loads: 5 }, error: '' }];
async function state(request) {
  const { useAnalysis } = await import('../src/services/analysis-state.js');
  const scope = Vue.effectScope();
  const messages = Vue.ref(snapshot()), selection = Vue.ref(['123@g.us']), loading = Vue.ref(false);
  const analysis = scope.run(() => useAnalysis(messages, selection, loading, request));
  return { ...analysis, messages, selection, loading, stop: () => { analysis.dispose(); scope.stop(); } };
}
test('analysis state sends a detached snapshot and handles loading, errors and retry', async () => {
  let release;
  const s = await state(async (groups) => {
    assert.deepEqual(groups, snapshot().map(({ groupId, messages, history }) => ({ groupId, messages, history })));
    await new Promise((resolve) => { release = resolve; });
    throw new Error('Ollama is unavailable.');
  });
  assert.equal(s.canAnalyze.value, true);
  const pending = s.analyzeDisplayed();
  assert.equal(s.analysisLoading.value, true);
  assert.equal(s.canAnalyze.value, false);
  await s.analyzeDisplayed(); // Cannot overlap.
  release(); await pending;
  assert.equal(s.analysisError.value, 'Ollama is unavailable.');
  assert.equal(s.canAnalyze.value, true);
  s.loading.value = true;
  assert.equal(s.analysisError.value, '');
  assert.equal(s.canAnalyze.value, false);
  s.loading.value = false;
  s.messages.value = [];
  assert.equal(s.canAnalyze.value, false);
  s.stop();
});
test('selection, load and snapshot changes invalidate results and ignore late success/error', async () => {
  for (const change of [(s) => { s.selection.value = ['456@g.us']; }, (s) => { s.loading.value = true; }, (s) => { s.messages.value[0].messages[0].body = 'Changed'; }]) {
    for (const fail of [false, true]) {
      let settle, signal;
      const s = await state((groups, options) => { signal = options.signal; return new Promise((resolve, reject) => { settle = () => fail ? reject(new Error('Late error')) : resolve([{ groupId: '123@g.us' }]); }); });
      const pending = s.analyzeDisplayed();
      change(s);
      assert.equal(signal.aborted, true);
      settle(); await pending;
      assert.deepEqual(s.analysisResults.value, []);
      assert.equal(s.analysisError.value, '');
      s.stop();
    }
  }
  const s = await state(async () => [{ groupId: '123@g.us' }]);
  await s.analyzeDisplayed();
  assert.equal(s.analysisResults.value.length, 1);
  s.messages.value = [];
  assert.deepEqual(s.analysisResults.value, []);
  s.stop();
});
async function view(overrides = {}) {
  const app = Vue.createSSRApp({ render, data: () => ({
    isDark: true, connectionStatus: 'ready', statusError: '', groups: [], selectedGroupIds: [],
    groupsLoading: false, groupsError: '', messagesLoading: false, messagesError: '', hasLoadedMessages: true,
    messageResults: snapshot(), analysisLoading: false, analysisResults: [], analysisError: '', canAnalyze: true,
    analyzeDisplayed() {}, loadGroups() {}, loadMessages() {}, formatMessageTime: () => 'Time', groupName: () => 'Synthetic',
    sourceMessage: () => snapshot()[0].messages[0].body, ...overrides,
  }) });
  app.component('AppHeader', { render: () => null }); app.component('GroupSelector', { render: () => null });
  return renderToString(app);
}
test('Vue renders loading, per-group errors, partial history, tasks, deadlines and escaped sources', async () => {
  assert.match(await view({ analysisLoading: true, canAnalyze: false }), /Analyzing retrieved messages locally/);
  assert.match(await view({ analysisError: 'Ollama is unavailable.' }), /Ollama is unavailable/);
  const html = await view({ analysisResults: [
    { groupId: '123@g.us', history: { reason: 'scan_limit' }, analysis: { summary: '<script>bad</script>', importantUpdates: [], tasks: [{ text: 'Synthetic task', messageIds: ['m1'], deadlineText: 'tomorrow' }, { text: 'Other', messageIds: ['m1'], deadlineText: null }] } },
    { groupId: '456@g.us', history: { reason: 'history_unavailable' }, error: { message: 'Ollama request timed out.' } },
    { groupId: '789@g.us', skipped: 'empty_group' },
  ] });
  for (const expected of ['Analysis of only the retrieved messages', 'Search limits reached', 'History is unavailable', 'Ollama request timed out.', 'Synthetic task', 'Deadline: tomorrow', 'Deadline: Not stated', 'View source: m1', 'Skipped: no retrieved messages.', '&lt;script&gt;', '&lt;img']) assert.ok(html.includes(expected), expected);
  assert.doesNotMatch(html, /<script>|<img/);
  assert.doesNotMatch(source, /v-html/);
});
test('API sends analysis JSON and handles per-group 207 and whole-request errors', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const { analyzeMessages } = await import('../src/services/api.js');
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/analysis'); assert.equal(options.method, 'POST'); assert.equal(options.cache, 'no-store');
    assert.deepEqual(JSON.parse(options.body), { groups: [] });
    return new Response(JSON.stringify({ results: [{ error: { code: 'OLLAMA_TIMEOUT' } }] }), { status: 207 });
  };
  assert.equal((await analyzeMessages([]))[0].error.code, 'OLLAMA_TIMEOUT');
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Another analysis request is in progress.' } }), { status: 429 });
  await assert.rejects(analyzeMessages([]), /Another analysis request/);
});
test('dev proxy translates only the exact local UI Origin', async () => {
  const { default: config } = await import('../vite.config.js');
  let handler;
  config.server.proxy['/api'].configure({ on(event, callback) { assert.equal(event, 'proxyReq'); handler = callback; } });
  for (const origin of ['http://127.0.0.1:5173', 'https://attacker.example', 'null', undefined]) {
    const headers = {};
    handler({ setHeader: (key, value) => { headers[key] = value; } }, { headers: { origin } });
    assert.deepEqual(headers, origin === 'http://127.0.0.1:5173' ? { Origin: 'http://127.0.0.1:3001' } : {});
  }
});
