const test = require('node:test');
const assert = require('node:assert/strict');
const createApp = require('../src/app');
const createAnalysisService = require('../src/features/analysis/analysis.service');
const snapshot = () => ({ groups: [{ groupId: '123@g.us', messages: [{ id: 'm1', groupId: '123@g.us', timestamp: 1, type: 'chat', body: 'Synthetic task tomorrow.', fromMe: false }], history: { reason: 'history_unavailable', scanned: 1, loads: 1 } }] });
async function api(t, analyze) {
  const forbidden = new Proxy({}, { get() { throw new Error('WhatsApp must not be accessed'); } });
  const server = createApp({ client: forbidden, whatsapp: forbidden, Chat: class {}, analysis: { analyze } }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = 'http://127.0.0.1:' + server.address().port;
  return async (body = snapshot(), headers = {}, route = '/api/analysis') => {
    const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, data: await response.json() };
  };
}
test('analysis accepts snapshots without WhatsApp readiness, preserves history, skips empty groups and separates failures', async (t) => {
  const calls = [];
  const request = await api(t, async (messages) => {
    calls.push(messages);
    if (messages[0].groupId === '456@g.us') throw Object.assign(new Error('PRIVATE_SENTINEL'), { code: 'OLLAMA_TIMEOUT' });
    return { summary: 'Synthetic', importantUpdates: [], tasks: [] };
  });
  const body = snapshot();
  body.groups.push({ ...body.groups[0], groupId: '456@g.us', messages: body.groups[0].messages.map((m) => ({ ...m, groupId: '456@g.us' })) });
  body.groups.push({ groupId: '789@g.us', messages: [], history: { reason: 'history_unavailable', scanned: 0, loads: 0 } });
  const { status, data } = await request(body);
  assert.equal(status, 207);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], body.groups[0].messages);
  assert.deepEqual(data.results[0].history, body.groups[0].history);
  assert.equal(data.results[0].scope, 'retrieved_messages_only');
  assert.equal(data.results[1].error.code, 'OLLAMA_TIMEOUT');
  assert.equal(data.results[2].skipped, 'empty_group');
  assert.equal(JSON.stringify(data).includes('PRIVATE_SENTINEL'), false);
});
test('validates all groups and message fields before invoking analysis', async (t) => {
  let calls = 0;
  const request = await api(t, async () => { calls++; });
  const invalid = [{}, { groups: [] }, { groups: Array(6).fill(snapshot().groups[0]) }, { groups: [snapshot().groups[0], snapshot().groups[0]] }];
  for (const change of [
    (g) => { g.groupId = '123@c.us'; }, (g) => { g.extra = true; },
    (g) => { g.messages = []; }, (g) => { g.history.reason = 'history_exhausted'; },
    (g) => { g.history.scanned = 501; }, (g) => { g.history.loads = 6; }, (g) => { delete g.history; },
    (g) => { g.messages.push(g.messages[0]); }, (g) => { g.messages = Array(51).fill(g.messages[0]); },
    ...Object.entries({ id: '', groupId: '456@g.us', timestamp: -1, type: 'image', body: ' ', fromMe: 'false', extra: true }).map(([key, value]) => (g) => { g.messages[0][key] = value; }),
    (g) => { delete g.messages[0].fromMe; }, (g) => { g.messages[0].id = 'x'.repeat(257); },
    (g) => { g.messages[0].body = 'x'.repeat(8001); },
    (g) => { g.messages = Array.from({ length: 5 }, (_, i) => ({ ...g.messages[0], id: String(i), body: 'x'.repeat(8000) })); g.history.scanned = 5; },
  ]) { const body = snapshot(); change(body.groups[0]); invalid.push(body); }
  for (const body of invalid) assert.equal((await request(body)).status, 400);
  assert.equal(calls, 0);
});
test('analysis lock rejects overlap and releases after failures; unknown errors are sanitized', async (t) => {
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const request = await api(t, async () => { calls++; await wait; throw new Error('PRIVATE_SENTINEL'); });
  const first = request();
  while (!calls) await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await request()).status, 429);
  release();
  const result = await first;
  assert.equal(result.data.results[0].error.code, 'ANALYSIS_FAILED');
  assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
  assert.equal((await request()).status, 207);
  assert.equal(calls, 2);
});

test('empty summaries and token-limited completions become per-group errors rather than success', async (t) => {
  for (const [summary, doneReason] of [['', 'stop'], ['Valid-looking but truncated summary.', 'length']]) {
    const service = createAnalysisService({ fetchImpl: async () => new Response(JSON.stringify({ done: true, done_reason: doneReason,
      message: { role: 'assistant', content: JSON.stringify({ summary, importantUpdates: [], tasks: [] }) } })) });
    const request = await api(t, service.analyze);
    const { status, data } = await request();
    assert.equal(status, 207);
    assert.equal(data.results[0].error.code, 'INVALID_MODEL_OUTPUT');
    assert.equal(Object.hasOwn(data.results[0], 'analysis'), false);
  }
});
test('analysis keeps local protections and uses a bounded route-specific JSON budget', async (t) => {
  const request = await api(t, async () => ({ summary: '', importantUpdates: [], tasks: [] }));
  const body = snapshot();
  body.groups[0].messages[0].body = 'x'.repeat(5000);
  assert.equal((await request(body)).status, 200);
  assert.equal((await request(body, {}, '/api/messages')).status, 413);
  assert.equal((await request('x'.repeat(192 * 1024 + 1))).status, 413);
  assert.equal((await request('{')).status, 400);
  assert.equal((await request(snapshot(), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await request(snapshot(), { Origin: 'https://attacker.example' })).status, 403);
  // Node fetch rewrites Host; use node:http to exercise an actual foreign Host.
  const server = createApp({ client: {}, whatsapp: {}, Chat: class {}, analysis: { analyze: async () => assert.fail('Forbidden host') } }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const status = await new Promise((resolve, reject) => {
    const req = require('node:http').request({ host: '127.0.0.1', port: server.address().port, path: '/api/analysis', method: 'POST', headers: { Host: 'attacker.example' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end();
  });
  assert.equal(status, 403);
  assert.equal((await request(snapshot(), { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await request(snapshot(), { 'Content-Encoding': 'gzip' })).status, 415);
});
