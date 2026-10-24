const test = require('node:test');
const assert = require('node:assert/strict');
const { gzipSync } = require('node:zlib');
const { pathToFileURL } = require('node:url');
const { isPrivatePath } = require('../scripts/check-publication');
const createApp = require('../src/app');
const { apiError } = require('../src/middleware/error-handler');

test('compressed JSON, including trailing bytes, is safely rejected and HTTP remains usable', async (t) => {
  const whatsapp = {
    getStatus: () => ({ status: 'idle', ready: false }),
    requireReady: () => { throw apiError(503, 'WHATSAPP_NOT_READY', 'WhatsApp is not ready.'); },
  };
  const server = createApp({ client: {}, whatsapp, Chat: class {} }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = 'http://127.0.0.1:' + server.address().port;
  const json = JSON.stringify({ groupIds: ['123@g.us'] });
  const compressed = gzipSync(json);
  for (const body of [compressed, Buffer.concat([compressed, Buffer.from('synthetic trailing bytes')])]) {
    const response = await fetch(base + '/api/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, body,
    });
    assert.equal(response.status, 415);
    assert.deepEqual(await response.json(), { error: { code: 'ENCODING_UNSUPPORTED', message: 'Compressed request bodies are not supported.' } });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const status = await fetch(base + '/api/status');
  assert.equal(status.status, 200);
  const plain = await fetch(base + '/api/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json,
  });
  assert.equal(plain.status, 503); // Uncompressed valid JSON reaches the normal readiness gate.
});

test('publication guard blocks sensitive path categories without opening files', () => {
  for (const name of [
    'backend/.wwebjs_auth/dummy', 'backend/.wwebjs_cache/dummy', 'backend/.env', '.env.production',
    'backend/data/example.db', 'backend/logs/example.log', 'exports/dummy.txt', 'screenshots/example.png',
    'backup.zip', 'trace.har', 'key.pem', 'credentials-dummy.json', 'cookies-dummy.json',
    'backend\\.wwebjs_auth\\dummy', 'BACKEND/.WWEBJS_AUTH/dummy',
  ]) assert.equal(isPrivatePath(name), true, name);
  for (const name of ['README.md', '.gitignore', 'backend/package-lock.json', 'backend/src/app.js', 'backend/test/security.test.js']) {
    assert.equal(isPrivatePath(name), false, name);
  }
});

test('patched dependency chain imports and validates synthetic browser protocol data offline', async () => {
  const lock = require('../package-lock.json');
  const version = (name) => lock.packages['node_modules/' + name].version;
  const atLeast = (value, floor) => {
    const a = value.split('.').map(Number), b = floor.split('.').map(Number);
    for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
    return true;
  };
  assert.ok(atLeast(version('body-parser'), '2.4.0'));
  assert.ok(atLeast(version('zod'), '4.6.6'));
  assert.equal(version('puppeteer'), '25.16.0');
  assert.equal(version('whatsapp-web.js'), '1.34.7');
  // Module import only: no Client construction, browser launch, network, or LocalAuth access.
  const puppeteer = require('puppeteer');
  assert.equal(typeof puppeteer.launch, 'function');
  const { Client, LocalAuth, Chat } = require('whatsapp-web.js');
  assert.equal(typeof Client, 'function');
  assert.equal(typeof LocalAuth, 'function');
  assert.equal(typeof Chat, 'function');
  const entry = pathToFileURL(require.resolve('chromium-bidi'));
  const parser = await import(new URL('./protocol-parser/protocol-parser.js', entry));
  assert.deepEqual(parser.Browser.parseCreateUserContextParameters({}), {});
  assert.throws(() => parser.Browser.parseRemoveUserContextParameters({ userContext: 123 }), /userContext/);
  assert.deepEqual(parser.Browser.parseRemoveUserContextParameters({ userContext: 'dummy-context' }), { userContext: 'dummy-context' });
});
