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
async function view(history, messages = []) {
  const app = Vue.createSSRApp({ render, data: () => ({
    isDark: false, connectionStatus: 'ready', statusError: '', groups: [], selectedGroupIds: [],
    groupsLoading: false, groupsError: '', messagesLoading: false, messagesError: '', hasLoadedMessages: true,
    messageResults: [{ groupId: 'synthetic', groupName: 'Synthetic', messages, history, error: '' }],
    analysisLoading: false, analysisResults: [], analysisError: '', canAnalyze: false, analyzeDisplayed() {},
    formatMessageTime: () => 'Synthetic time', loadGroups() {}, loadMessages() {},
  }) });
  app.component('AppHeader', { render: () => null });
  app.component('GroupSelector', { render: () => null });
  return renderToString(app);
}
test('frontend renders distinct empty, unavailable, and scan-limit states, retaining partial text', async () => {
  assert.match(source, /history: data.history/);
  const empty = await view({ reason: 'requested_count' });
  assert.match(empty, /No text messages were returned by this successful request/);
  const unavailable = await view({ reason: 'history_unavailable' });
  assert.match(unavailable, /History is unavailable/);
  assert.doesNotMatch(unavailable, /No text messages/);
  const limited = await view({ reason: 'scan_limit' });
  assert.match(limited, /Search limits reached/);
  assert.doesNotMatch(limited, /No text messages/);
  const partial = await view({ reason: 'history_unavailable' }, [{ id: 'dummy', timestamp: 1, body: 'Synthetic partial text' }]);
  assert.match(partial, /History is unavailable/);
  assert.match(partial, /Synthetic partial text/);
});
