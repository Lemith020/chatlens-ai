const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const createService = require('../src/features/whatsapp/whatsapp.service');
const startServer = require('../src/server');
const { safeDetails, createFailureReporter } = require('../src/diagnostics');

test('startup cause survives cleanup failure and diagnostics withhold private values', async () => {
  const startup = Object.assign(new TypeError('PRIVATE_STARTUP C:/private/session secret=abc'), { code: 'EBUSY' });
  const cleanup = Object.assign(new Error('PRIVATE_CLEANUP message body and credentials'), { code: 'EPERM' });
  const client = new EventEmitter();
  client.initialize = async () => { throw startup; };
  client.destroy = async () => { throw cleanup; };
  const whatsapp = createService(client);
  const lines = [];
  const state = { exitCode: 0 };
  const report = createFailureReporter({ processState: state, write: (line) => lines.push(JSON.parse(line)) });
  const runtime = startServer(require('express')(), whatsapp, report, 0);
  await new Promise((resolve) => runtime.server.once('close', resolve));
  await runtime.shutdown();
  const primary = runtime.getFailure();
  assert.equal(primary.step, 'whatsapp.start');
  assert.equal(primary.error.cause, startup);
  assert.equal(primary.error.cleanupError, cleanup);
  assert.equal(state.exitCode, 1);
  assert.equal(runtime.server.listening, false);
  assert.deepEqual(lines.map((line) => line.step), ['whatsapp.start', 'whatsapp.start.cleanup', 'whatsapp.stop']);
  assert.equal(lines[0].name, 'TypeError');
  assert.equal(lines[0].code, 'EBUSY');
  assert.equal(lines[1].code, 'EPERM');
  assert.equal(lines[2].code, 'EPERM');
  assert.doesNotMatch(JSON.stringify(lines), /PRIVATE|session|secret=|credentials|message body/);
});

test('unknown fields are withheld and Chrome causes use fixed descriptions', () => {
  const privateError = Object.assign(new Error('PRIVATE_CONTENT'), { name: 'PRIVATE_NAME', code: 'PRIVATE_CODE' });
  assert.deepEqual(safeDetails(privateError), {
    name: 'UnknownError', code: 'UNKNOWN', description: 'Unclassified failure; private error details were withheld.',
  });
  const chrome = safeDetails(new Error('Could not find Google Chrome at PRIVATE_PATH'));
  assert.equal(chrome.description, 'The configured Chrome executable could not be located.');
  assert.doesNotMatch(JSON.stringify(chrome), /PRIVATE_PATH/);
});

test('actual entry point exits non-zero after fake initialization and cleanup failures', () => {
  // Intercept only live-client construction. No Chrome, network, or session access.
  const script = `const Module = require('node:module');
const { EventEmitter } = require('node:events');
const client = new EventEmitter();
client.initialize = async () => { throw Object.assign(new Error('PRIVATE_STARTUP'), { code: 'ENOENT' }); };
client.destroy = async () => { throw Object.assign(new Error('PRIVATE_CLEANUP'), { code: 'EPERM' }); };
const load = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === './src/features/whatsapp/whatsapp.client') return client;
  if (request === './src/app') {
    const createApp = load.call(this, request, parent, isMain);
    return (options) => createApp({ ...options, Chat: class {} });
  }
  if (request === './config' && parent.filename.endsWith('server.js')) {
    return { ...load.call(this, request, parent, isMain), port: 0 };
  }
  return load.call(this, request, parent, isMain);
};
require('./index');`;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  const lines = result.stderr.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines[0].step, 'whatsapp.start');
  assert.equal(lines[0].code, 'ENOENT');
  assert.equal(lines[1].step, 'whatsapp.start.cleanup');
  assert.equal(lines[1].code, 'EPERM');
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_STARTUP|PRIVATE_CLEANUP|at .*\.js:/);
});
