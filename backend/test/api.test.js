const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const createApp = require('../src/app');
const createService = require('../src/features/whatsapp/whatsapp.service');
const createReader = require('../src/features/messages/messages.history');
const startServer = require('../src/server');
const a = '123@g.us', b = '456@g.us';
const message = (n, type = 'chat', body = 'Dummy ' + n) => ({ id: { _serialized: 'm' + n, fromMe: false }, t: n, type, body });
class Chat {
  constructor(client, data) { this.id = data.id; this.client = client; }
  async fetchMessages(options) { assert.equal(options, undefined); return (this.client.histories[this.id._serialized]?.initial || []).map((m) => ({ ...m, timestamp: m.t })); }
}
function fakeClient(histories = {}) {
  const client = new EventEmitter();
  client.calls = [];
  client.histories = histories;
  client.destroyed = 0;
  client.initialize = async () => {};
  client.destroy = async () => { client.destroyed++; };
  for (const name of ['sendSeen', 'markUnread', 'sendMessage', 'getChatById']) {
    client[name] = () => { throw new Error('Forbidden mutation/UI method: ' + name); };
  }
  client.pupPage = new EventEmitter();
  client.pupPage.evaluate = async (fn, id, initial, remaining) => {
    const fixture = histories[id] || { initial: [], batches: [] };
    let index = 0;
    const model = { msgs: { getModelsArray: () => fixture.initial || [] } };
    const context = {
      setTimeout: fixture.fastTimeout ? (callback) => setTimeout(callback, 1) : setTimeout, clearTimeout,
      window: {
        WWebJS: { getChat: async (selected, options) => {
          assert.equal(selected, id);
          assert.equal(options.getAsModel, false);
          client.calls.push(id);
          if (fixture.fail) throw new Error('PRIVATE_SENTINEL');
          if (fixture.wait) await fixture.wait;
          return fixture.unavailable ? null : model;
        } },
        require: (name) => {
          if (name === 'WAWebCollections') return { Chat: { getModelsArray: () => [
            { id: { _serialized: a }, name: 'Dummy A', unreadCount: 2, secret: 'omit' },
            { id: { _serialized: b }, name: 'Dummy B' },
            { id: { _serialized: '789@c.us' }, name: 'Direct' },
          ] } };
          assert.equal(name, 'WAWebChatLoadMessages');
          return { loadEarlierMsgs: async () => {
            if (fixture.loadFail) throw new Error('PRIVATE_SENTINEL');
            fixture.loads = (fixture.loads || 0) + 1;
            return (fixture.batches || [])[index++] || [];
          } };
        },
      },
    };
    return JSON.parse(JSON.stringify(await vm.runInNewContext('(' + fn.toString() + ')', context)(id, initial, remaining)));
  };
  return client;
}
async function api(t, histories = {}, ready = true) {
  const client = fakeClient(histories);
  const whatsapp = createService(client, { displayQr: () => {} });
  if (ready) client.emit('ready');
  const server = createApp({ client, whatsapp, Chat }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(route, expected = 200, options) {
    const response = await fetch(base + route, options);
    assert.equal(response.status, expected);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    return response.json();
  }
  return { client, whatsapp, request, base };
}
const post = (groupIds) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupIds }) });

test('status transitions and readiness gates', async (t) => {
  const { client, request, whatsapp } = await api(t, {}, false);
  assert.equal((await request('/api/status')).whatsapp.status, 'idle');
  await request('/api/groups', 503);
  await request('/api/groups/' + a + '/messages', 503);
  await request('/api/messages', 503, post([a]));
  await whatsapp.start();
  assert.equal(whatsapp.getStatus().status, 'initializing');
  for (const [event, status] of [['qr', 'qr_required'], ['authenticated', 'authenticated'], ['ready', 'ready'], ['auth_failure', 'auth_failure'], ['disconnected', 'disconnected']]) {
    client.emit(event, 'PRIVATE_SENTINEL');
    assert.equal((await request('/api/status')).whatsapp.status, status);
  }
  client.emit('authenticated');
  client.pupPage.emit('error', new Error('PRIVATE_SENTINEL'));
  assert.equal(whatsapp.getStatus().status, 'error');
  await whatsapp.stop();
  client.emit('ready');
  assert.deepEqual(whatsapp.getStatus(), { status: 'stopped', ready: false });
});

test('group metadata only and strict IDs', async (t) => {
  const { request, client } = await api(t);
  assert.deepEqual(await request('/api/groups'), { groups: [
    { id: a, name: 'Dummy A', unreadCount: 2 }, { id: b, name: 'Dummy B', unreadCount: 0 },
  ] });
  for (const id of ['123@c.us', 'bad', a + ' ']) await request('/api/groups/' + encodeURIComponent(id) + '/messages', 400);
  await request('/api/groups/999@g.us/messages', 404);
  assert.deepEqual(client.calls, []);
});

test('single selection searches mixed history, filters media/blank text, deduplicates and orders', async (t) => {
  const fixture = { initial: [message(30), message(29, 'chat', '  '), message(28, 'gp2'), message(27, 'sticker'), message(26, 'image'), message(25, 'video'), message(24, 'message_history_notice'), message(23, 'e2e_notification')],
    batches: [[message(30), ...Array.from({ length: 9 }, (_, i) => message(20 - i))]] };
  const { request, client } = await api(t, { [a]: fixture });
  const result = await request('/api/groups/' + a + '/messages');
  assert.equal(result.messages.length, 10);
  assert.equal(result.history.reason, 'requested_count');
  assert.equal(fixture.loads, 1);
  assert.deepEqual(result.messages.map((m) => m.timestamp), [12,13,14,15,16,17,18,19,20,30]);
  assert.equal(new Set(result.messages.map((m) => m.id)).size, 10);
  assert.deepEqual(Object.keys(result.messages[0]).sort(), ['body','fromMe','groupId','id','timestamp','type']);
  assert.deepEqual(client.calls, [a]);
});

test('fewer messages and empty history remain successful with honest unavailable reason', async (t) => {
  const { request } = await api(t, { [a]: { initial: [message(1, 'chat', '  Dummy  ')], batches: [] } });
  const result = await request('/api/groups/' + a + '/messages');
  assert.equal(result.messages[0].body, 'Dummy');
  assert.equal(result.history.reason, 'history_unavailable');
  const empty = await request('/api/groups/' + b + '/messages');
  assert.deepEqual(empty.messages, []);
  assert.equal(empty.history.reason, 'history_unavailable');
});

test('500-record scan bound and five-load bound', async () => {
  const fixture = { initial: Array.from({ length: 501 }, (_, i) => message(i, 'gp2')) };
  let result = await createReader(fakeClient({ [a]: fixture }), Chat)(a);
  assert.equal(result.history.scanned, 500);
  assert.equal(result.history.reason, 'scan_limit');
  const batches = Array.from({ length: 6 }, (_, i) => [message(10-i, 'gp2')]);
  const loading = { initial: [], batches };
  result = await createReader(fakeClient({ [a]: loading }), Chat)(a);
  assert.equal(loading.loads, 5);
  assert.equal(result.history.reason, 'scan_limit');
});

test('overlapping loads stop without progress and malformed IDs cannot loop', async () => {
  const fixture = { initial: [message(1)], batches: [[message(1)], [message(2)]] };
  const result = await createReader(fakeClient({ [a]: fixture }), Chat)(a);
  assert.equal(fixture.loads, 1);
  assert.equal(result.history.reason, 'history_unavailable');
  const bad = { initial: [{ type: 'chat', body: 'Dummy' }], batches: [[{ type: 'chat', body: 'Dummy' }]] };
  await assert.rejects(createReader(fakeClient({ [a]: bad }), Chat)(a));
  assert.equal(bad.loads, undefined);
});

test('unavailable chat and history load errors are distinguished', async (t) => {
  const { request } = await api(t, { [a]: { unavailable: true }, [b]: { initial: [message(1)], loadFail: true } });
  assert.equal((await request('/api/groups/' + a + '/messages')).history.reason, 'history_unavailable');
  const error = await request('/api/groups/' + b + '/messages', 502);
  assert.equal(error.error.code, 'MESSAGE_FETCH_FAILED');
  assert.equal(JSON.stringify(error).includes('PRIVATE_SENTINEL'), false);
});

test('multiple selection supports success, missing groups and partial fetch failures', async (t) => {
  const { request, client } = await api(t, { [a]: { initial: [message(1)] }, [b]: { fail: true } });
  let result = await request('/api/messages', 207, post([a,b]));
  assert.equal(result.results[0].groupId, a);
  assert.equal(result.results[0].messages.length, 1);
  assert.equal(result.results[1].error.code, 'MESSAGE_FETCH_FAILED');
  assert.deepEqual(client.calls, [a,b]);
  result = await request('/api/messages', 207, post(['999@g.us', b]));
  assert.equal(result.results[0].error.code, 'GROUP_NOT_FOUND');
  assert.equal(result.results[1].error.code, 'MESSAGE_FETCH_FAILED');
});

test('multiple successful groups are identified separately', async (t) => {
  const { request } = await api(t);
  const result = await request('/api/messages', 200, post([a,b]));
  assert.deepEqual(result.results.map((r) => r.groupId), [a,b]);
});

test('input, JSON and size limits', async (t) => {
  const { request, client } = await api(t);
  for (const ids of [[], [a,a], 'bad', [a, '123@c.us'], Array.from({length:6}, (_, i) => i + '@g.us')]) await request('/api/messages', 400, post(ids));
  await request('/api/messages', 400, { ...post([a]), body: '{' });
  await request('/api/messages', 413, { ...post([a]), body: JSON.stringify({ groupIds: ['x'.repeat(5000)] }) });
  await request('/api/messages', 400, { ...post([a]), body: JSON.stringify({ groupIds: [a], extra: true }) });
  await request('/api/messages', 415, { method: 'POST', body: 'dummy' });
  assert.deepEqual(client.calls, []);
});

test('Host, Origin, cross-site and static access protections', async (t) => {
  const { request, base } = await api(t);
  const badHost = await new Promise((resolve, reject) => {
    const req = require('node:http').get(base + '/api/status', { headers: { Host: 'attacker.example' } }, (res) => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
  });
  assert.equal(badHost, 403);
  await request('/api/status', 403, { headers: { Origin: 'https://attacker.example' } });
  await request('/api/status', 403, { headers: { Origin: 'null' } });
  await request('/api/status', 403, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
  await request('/api/status', 200, { headers: { Origin: base } });
  for (const url of ['/README.md', '/.wwebjs_auth/dummy', '/logs/dummy', '/data/dummy']) await request(url, 404);
});

test('overlapping requests are rejected and fetch lock is released', async (t) => {
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const { request, client } = await api(t, { [a]: { wait, initial: [] } });
  const first = request('/api/groups/' + a + '/messages');
  while (!client.calls.length) await new Promise((resolve) => setImmediate(resolve));
  await request('/api/groups/' + b + '/messages', 429);
  release();
  await first;
  await request('/api/groups/' + b + '/messages');
});

test('configuration preserves session path and dependency override', () => {
  const config = require('../src/config');
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.authPath, path.resolve(__dirname, '../.wwebjs_auth'));
  assert.deepEqual(config.puppeteer, { channel: 'chrome', headless: false, protocolTimeout: 300000 });
  assert.equal(require('../package.json').overrides['whatsapp-web.js'].puppeteer, '25.16.0');
});

test('startup is shared, failures are safe and cleanup is attempted', async () => {
  const client = fakeClient();
  let calls = 0;
  client.initialize = async () => { calls++; throw new Error('PRIVATE_SENTINEL'); };
  const service = createService(client);
  const first = service.start();
  assert.equal(service.start(), first);
  await assert.rejects(first, /^Error: WhatsApp startup failed\.$/);
  assert.equal(calls, 1);
  assert.equal(client.destroyed, 1);
  assert.deepEqual(service.getStatus(), { status: 'error', ready: false });
});

test('shutdown is idempotent and closes a browser appearing after initialization', async () => {
  const client = fakeClient();
  let release;
  client.initialize = () => new Promise((resolve) => { release = resolve; });
  const service = createService(client);
  const starting = service.start();
  await new Promise((resolve) => setImmediate(resolve));
  const stopping = service.stop();
  assert.equal(service.stop(), stopping);
  await stopping;
  release();
  await starting;
  assert.equal(client.destroyed, 2);
  assert.equal(service.getStatus().status, 'stopped');
});

test('stuck browser cleanup terminates only the owned process', async () => {
  const client = fakeClient();
  client.destroy = () => new Promise(() => {});
  let kills = 0;
  client.pupBrowser = { process: () => ({ kill: (signal) => { assert.equal(signal, 'SIGKILL'); kills++; } }) };
  const service = createService(client, { shutdownMs: 10 });
  await assert.rejects(service.stop(), /Browser cleanup did not complete/);
  assert.equal(kills, 1);
});

test('server shutdown closes HTTP and stops service once', async () => {
  let stops = 0;
  const runtime = startServer(require('express')(), { start: async () => {}, stop: async () => { stops++; } }, () => assert.fail('unexpected failure'), 0);
  await new Promise((resolve) => runtime.server.once('listening', resolve));
  assert.equal(runtime.server.address().address, '127.0.0.1');
  const stopping = runtime.shutdown();
  assert.equal(runtime.shutdown(), stopping);
  await stopping;
  assert.equal(runtime.server.listening, false);
  assert.equal(stops, 1);
});

test('failed startup closes the HTTP listener', async () => {
  let failures = 0, stops = 0;
  const runtime = startServer(require('express')(), { start: async () => { throw new Error('PRIVATE_SENTINEL'); }, stop: async () => { stops++; } }, () => { failures++; }, 0);
  await new Promise((resolve) => runtime.server.once('close', resolve));
  await runtime.shutdown();
  assert.equal(failures, 1);
  assert.equal(stops, 1);
  assert.equal(runtime.server.listening, false);
});


test('history timeout is a non-success response, not partial success', async (t) => {
  const wait = new Promise(() => {});
  const { request } = await api(t, { [a]: { wait, fastTimeout: true } });
  const result = await request('/api/groups/' + a + '/messages', 502);
  assert.equal(result.error.code, 'MESSAGE_FETCH_FAILED');
});

test('shutdown requested before initialization does not launch the client', async () => {
  const client = fakeClient();
  let starts = 0;
  client.initialize = async () => { starts++; };
  const service = createService(client);
  const pending = service.start();
  await service.stop();
  await pending;
  assert.equal(starts, 0);
  assert.equal(service.getStatus().ready, false);
});

test('bind failures clean up without initializing WhatsApp', async () => {
  const express = require('express');
  const occupied = express().listen(0, '127.0.0.1');
  await new Promise((resolve) => occupied.once('listening', resolve));
  let starts = 0, stops = 0, failures = 0;
  try {
    const runtime = startServer(express(), {
      start: async () => { starts++; }, stop: async () => { stops++; },
    }, () => { failures++; }, occupied.address().port);
    await new Promise((resolve) => runtime.server.once('error', resolve));
    await runtime.shutdown();
    assert.equal(starts, 0);
    assert.equal(stops, 1);
    assert.equal(failures, 1);
  } finally { await new Promise((resolve) => occupied.close(resolve)); }
});


test('group lookup failures are sanitized and release the message-request lock', async (t) => {
  const { request, client } = await api(t);
  const evaluate = client.pupPage.evaluate;
  client.pupPage.evaluate = async () => { throw new Error('PRIVATE_SENTINEL'); };
  for (const route of ['/api/groups', '/api/groups/' + a + '/messages']) {
    const result = await request(route, 500);
    assert.deepEqual(result, { error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' } });
  }
  client.pupPage.evaluate = evaluate;
  await request('/api/groups/' + a + '/messages');
});
