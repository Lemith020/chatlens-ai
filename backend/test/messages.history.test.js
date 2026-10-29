const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { Chat, Message } = require('whatsapp-web.js'); // Import only; no Client/session/browser.
const createReader = require('../src/features/messages/messages.history');
const id = '123@g.us';
const sourceLines = require('node:fs').readFileSync(require.resolve('../src/features/messages/messages.history'), 'utf8').split(/\r?\n/);
function checkDiagnostic(entry, expected) {
  const { source, shape, ...details } = entry;
  assert.deepEqual(details, { step: 'messages.history', ...expected });
  assert.equal(source.filename, 'messages.history.js');
  assert.ok(Number.isInteger(source.line) && source.line > 0);
  assert.match(sourceLines[source.line - 2], new RegExp("mark\\('" + expected.operation.replaceAll('.', '\\.') + "'"));
  assert.equal(typeof shape, 'object');
  assert.doesNotMatch(JSON.stringify(entry), /PRIVATE|123@g.us|credential|session|Synthetic|[A-Z]:\\|\\Users\\|\"stack\"|\"message\"/);
}
function fixture({ cached = [], load = async () => [], fetchError, chatClass = Chat } = {}) {
  const diagnostics = [];
  const calls = [];
  const client = {
    getChatById() { assert.fail('getChatById must never be called'); },
    pupPage: { async evaluate(fn, ...args) {
      const libraryFetch = args.length === 2;
      calls.push(libraryFetch ? 'fetchMessages' : 'history');
      if (libraryFetch && fetchError) throw fetchError;
      const model = { msgs: { getModelsArray: () => cached } };
      const context = { setTimeout, clearTimeout, window: {
        WWebJS: { getChat: async (selected, options) => { assert.equal(selected, id); assert.equal(options.getAsModel, false); return model; }, getMessageModel: (m) => m },
        require(name) {
          assert.equal(name, 'WAWebChatLoadMessages');
          return { loadEarlierMsgs: (options) => { assert.equal(options.chat, model); return load(options); } };
        },
      } };
      // Model the JSON argument boundary used by Puppeteer's CDP transport.
      const transported = libraryFetch ? args : JSON.parse(JSON.stringify(args));
      return JSON.parse(JSON.stringify(await vm.runInNewContext('(' + fn.toString() + ')', context)(...transported)));
    } },
  };
  return { read: createReader(client, chatClass, { diagnose: (entry) => diagnostics.push(entry) }), calls, diagnostics };
}
const message = (n) => ({ id: { _serialized: 'dummy' + n, fromMe: false }, t: n, type: 'chat', body: 'Synthetic' });
test('actual Chat.fetchMessages reads cached messages without unbounded pagination or getChatById', async () => {
  const f = fixture({ cached: Array.from({ length: 10 }, (_, i) => message(i)), load: () => assert.fail('unnecessary load') });
  const result = await f.read(id);
  assert.equal(result.messages.length, 10);
  assert.equal(result.history.reason, 'requested_count');
  assert.deepEqual(f.calls, ['fetchMessages', 'history']);
  assert.deepEqual(f.diagnostics, []);
});
test('observed empty first load is unavailable, never exhausted', async () => {
  const f = fixture();
  const result = await f.read(id);
  assert.deepEqual(result.history, { reason: 'history_unavailable', scanned: 0, loads: 1, operation: 'loadEarlierMsgs', code: 'EMPTY_LOAD' });
  assert.equal(f.diagnostics.length, 1);
  checkDiagnostic(f.diagnostics[0], { operation: 'loadEarlierMsgs', name: 'Unavailable', code: 'EMPTY_LOAD' });
});
test('browser library rejection is not converted into an empty success and diagnostics are sanitized', async () => {
  const f = fixture({ cached: [message(1)], load: async () => { throw Object.assign(new TypeError('PRIVATE text 123@g.us phone session credential'), { code: 'EPERM' }); } });
  await assert.rejects(f.read(id));
  assert.equal(f.diagnostics.length, 1);
  checkDiagnostic(f.diagnostics[0], { operation: 'loadEarlierMsgs', name: 'TypeError', code: 'EPERM' });
  assert.doesNotMatch(JSON.stringify(f.diagnostics), /PRIVATE|123@g.us|credential|session/);
});
test('fetchMessages failures identify the operation and withhold unknown names/codes', async () => {
  const f = fixture({ fetchError: Object.assign(new Error('PRIVATE'), { name: 'PRIVATE_NAME', code: 'PRIVATE_CODE' }) });
  await assert.rejects(f.read(id));
  assert.equal(f.diagnostics.length, 1);
  checkDiagnostic(f.diagnostics[0], { operation: 'chat.fetchMessages', name: 'UnknownError', code: 'UNKNOWN' });
});
test('invalid loader return preserves cached text and declares unavailable', async () => {
  const f = fixture({ cached: [message(1)], load: async () => undefined });
  const result = await f.read(id);
  assert.equal(result.messages.length, 1);
  assert.equal(result.history.code, 'INVALID_LOAD_RESULT');
});

test('scan TypeErrors identify sort, record access, key validation, and text validation without private values', async (t) => {
  const cases = [
    { name: 'null single record', records: [null], operation: 'scan.record.id', field: 'record', type: 'object', null: true },
    { name: 'null sort operand', records: [null, message(1)], operation: 'scan.sort.fields' },
    { name: 'nonnumeric sort operand', records: [{ ...message(1), t: Symbol('PRIVATE') }, message(2)], operation: 'scan.sort.compare' },
    { name: 'absent ID', records: [{ ...message(1), id: undefined }], operation: 'scan.normalize.id', field: 'id', type: 'undefined' },
    { name: 'nonstring ID', records: [{ ...message(1), id: { _serialized: { private: 'PRIVATE' } } }], operation: 'scan.normalize.id', field: 'id', type: 'object' },
    { name: 'absent text', records: [{ ...message(1), body: undefined }], operation: 'scan.validate.text', field: 'body', type: 'undefined' },
    { name: 'nonstring text', records: [{ ...message(1), body: { private: 'PRIVATE' } }], operation: 'scan.validate.text', field: 'body', type: 'object' },
    { name: 'timestamp using instance field on raw model', records: [{ ...message(1), t: undefined, timestamp: 1 }], operation: 'scan.validate.text', field: 'timestamp', type: 'undefined' },
    { name: 'nonfinite timestamp', records: [{ ...message(1), t: NaN }], operation: 'scan.validate.text', field: 'timestamp', type: 'number' },
  ];
  for (const entry of cases) await t.test(entry.name, async () => {
    const f = fixture({ load: async () => entry.records });
    await assert.rejects(f.read(id));
    assert.equal(f.diagnostics.length, 1);
    const diagnostic = f.diagnostics[0];
    checkDiagnostic(diagnostic, { operation: entry.operation, name: 'TypeError', code: 'UNKNOWN' });
    assert.equal(diagnostic.shape.loads, 1);
    assert.equal(diagnostic.shape.returned, 0);
    if (entry.field) {
      assert.equal(diagnostic.shape[entry.field].type, entry.type);
      if (entry.null) assert.equal(diagnostic.shape[entry.field].null, true);
    }
    if (entry.name === 'nonfinite timestamp') assert.equal(diagnostic.shape.timestamp.finite, false);
    // Shape leaves can only be type names, booleans, or counts: never input values.
    function checkShape(value) {
      if (typeof value === 'object') for (const item of Object.values(value)) checkShape(item);
      else if (typeof value === 'string') assert.ok(['object', 'undefined', 'boolean', 'number', 'bigint', 'string', 'symbol', 'function'].includes(value));
      else assert.ok(typeof value === 'boolean' || typeof value === 'number');
    }
    checkShape(diagnostic.shape);
  });
});

test('throwing raw-model accessor stays a failed request, without inspecting its error message or stack', async () => {
  const error = Object.assign(new TypeError('PRIVATE'), { code: 'PRIVATE_CODE' });
  Object.defineProperty(error, 'stack', { get() { assert.fail('raw stack must not be read'); } });
  Object.defineProperty(error, 'message', { get() { assert.fail('private error message must not be read'); } });
  const record = message(1);
  Object.defineProperty(record, 'body', { get() { throw error; } });
  const f = fixture({ load: async () => [record] });
  await assert.rejects(f.read(id));
  checkDiagnostic(f.diagnostics[0], { operation: 'scan.record.body', name: 'TypeError', code: 'UNKNOWN' });
});

test('cached adapter mapping failures identify the field and safe shape', async () => {
  class MalformedChat {
    constructor(client, data) { assert.deepEqual(data, { id: { _serialized: id } }); this.id = data.id; }
    async fetchMessages() { return [null]; }
  }
  const f = fixture({ chatClass: MalformedChat });
  await assert.rejects(f.read(id));
  checkDiagnostic(f.diagnostics[0], { operation: 'cached.record.id', name: 'TypeError', code: 'UNKNOWN' });
  assert.equal(f.diagnostics[0].shape.record.null, true);
});

test('raw t and Message.timestamp batches retain text, deduplicate, and do not coerce invalid fields', async () => {
  const f = fixture({ cached: [message(3)], load: async () => [message(1), message(2), message(3)] });
  const result = await f.read(id);
  assert.deepEqual(result.messages.map((m) => m.timestamp), [1, 2, 3]);
  assert.equal(result.history.reason, 'history_unavailable');
  assert.equal(result.history.code, 'NO_PROGRESS');
});

test('installed MessageId shape survives cached adapter transport and deduplicates against raw models', async () => {
  const raw = (n) => ({ ...message(n), id: { _serialized: 'dummy' + n, id: 'local' + n, remote: '123@g.us', fromMe: false } });
  const f = fixture({ cached: [raw(3)], load: async () => [raw(1), raw(2), raw(3)] });
  const result = await f.read(id);
  assert.deepEqual(result.messages.map((m) => m.id), ['dummy1', 'dummy2', 'dummy3']);
  assert.deepEqual(result.messages.map((m) => m.timestamp), [1, 2, 3]);
  assert.equal(result.history.scanned, 3);
});

test('cached identity fields survive argument serialization for component and nonenumerable serialized IDs', async (t) => {
  const components = { id: 'PRIVATE_LOCAL', remote: '123@g.us', fromMe: false };
  const nonenumerable = { ...components };
  Object.defineProperty(nonenumerable, '_serialized', { value: 'PRIVATE_SERIALIZED', enumerable: false });
  const customJSON = { ...components, _serialized: 'PRIVATE_SERIALIZED', toJSON() { return { ...components }; } };
  for (const input of [components, nonenumerable, customJSON]) await t.test('stable identity at the argument boundary', async () => {
    class SyntheticChat extends Chat {
      async fetchMessages(options) {
        assert.equal(options, undefined);
        return [new Message(this.client, { ...message(1), id: input })];
      }
    }
    const f = fixture({ chatClass: SyntheticChat });
    const result = await f.read(id);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].id, require('../src/features/messages/messages.identity')(input).responseId);
    assert.equal(result.history.scanned, 1);
    assert.equal(result.history.reason, 'history_unavailable');
    checkDiagnostic(f.diagnostics[0], { operation: 'loadEarlierMsgs', name: 'Unavailable', code: 'EMPTY_LOAD' });
  });
});

test('component identities deduplicate cached/raw overlap while preserving remote, direction, and participant', async () => {
  const raw = (n, changes = {}) => ({ ...message(n), id: { remote: '123@g.us', fromMe: false, id: 'local' + n, ...changes } });
  const cached = raw(5);
  const withSerialized = raw(5, { _serialized: 'synthetic-serialized-5' });
  const distinctRemote = raw(4, { id: 'local5', remote: 'other@g.us' });
  const distinctDirection = raw(3, { id: 'local5', fromMe: true });
  const participantA = raw(2, { id: 'local5', participant: 'sender-a@c.us' });
  const participantB = raw(1, { id: 'local5', participant: 'sender-b@c.us' });
  let loads = 0;
  const f = fixture({ cached: [cached], load: async () => {
    loads++;
    return loads === 1 ? [withSerialized, distinctRemote, distinctDirection, participantA, participantB] : [withSerialized];
  } });
  const result = await f.read(id);
  assert.equal(result.messages.length, 5);
  assert.equal(result.history.scanned, 5);
  assert.equal(new Set(result.messages.map((m) => m.id)).size, 5);
  assert.deepEqual(result.messages.map((m) => m.timestamp), [1, 2, 3, 4, 5]);
  assert.equal(result.messages.find((m) => m.timestamp === 3).fromMe, true);
});

test('serialized cached identity also deduplicates a component-only loaded record', async () => {
  const raw = { ...message(1), id: { remote: '123@g.us', fromMe: false, id: 'local1' } };
  const f = fixture({ cached: [{ ...raw, id: { ...raw.id, _serialized: 'synthetic-serialized' } }], load: async () => [raw] });
  const result = await f.read(id);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].id, 'synthetic-serialized');
  assert.equal(result.history.scanned, 1);
});

test('malformed component IDs and malformed duplicate text remain failed history requests', async (t) => {
  for (const change of [{ fromMe: 'false' }, { remote: undefined }, { id: {} }, { participant: {} }]) await t.test('invalid components', async () => {
    const f = fixture({ load: async () => [{ ...message(1), id: { remote: '123@g.us', fromMe: false, id: 'local1', ...change } }] });
    await assert.rejects(f.read(id));
    checkDiagnostic(f.diagnostics[0], { operation: 'scan.normalize.id', name: 'TypeError', code: 'UNKNOWN' });
  });
  const f = fixture({ cached: [message(1)], load: async () => [{ ...message(1), body: {} }] });
  await assert.rejects(f.read(id));
  checkDiagnostic(f.diagnostics[0], { operation: 'scan.validate.text', name: 'TypeError', code: 'UNKNOWN' });
});

test('installed getChat false option returns the raw model required by the history loader', async () => {
  const { LoadUtils } = require('whatsapp-web.js/src/util/Injected/Utils');
  const raw = { msgs: { getModelsArray: () => [] } };
  const serialized = { synthetic: true };
  const wid = {};
  const context = { window: { require(name) {
    if (name === 'WAWebWidFactory') return { createWid: () => wid };
    if (name === 'WAWebCollections') return { Chat: { get(selected) { assert.equal(selected, wid); return raw; } } };
    assert.fail('unexpected module');
  } } };
  vm.runInNewContext('(' + LoadUtils.toString() + ')()', context);
  context.window.WWebJS.getChatModel = async (chat) => { assert.equal(chat, raw); return serialized; };
  assert.equal(await context.window.WWebJS.getChat(id, { getAsModel: false }), raw);
  assert.equal(typeof (await context.window.WWebJS.getChat(id, { getAsModel: false })).msgs.getModelsArray, 'function');
  assert.equal(await context.window.WWebJS.getChat(id), serialized);
});

test('six component-only cached Messages paginate to ten distinct chronological messages', async () => {
  const raw = (n) => ({ ...message(n), id: { remote: '123@g.us', fromMe: false, id: 'local' + n } });
  let loads = 0;
  const f = fixture({ cached: Array.from({ length: 6 }, (_, i) => raw(5 + i)), load: async () => {
    loads++;
    return Array.from({ length: 6 }, (_, i) => raw(1 + i));
  } });
  const result = await f.read(id);
  assert.equal(result.history.reason, 'requested_count');
  assert.equal(result.history.scanned, 10);
  assert.equal(result.history.loads, 1);
  assert.equal(loads, 1);
  assert.equal(result.messages.length, 10);
  assert.equal(new Set(result.messages.map((m) => m.id)).size, 10);
  assert.deepEqual(result.messages.map((m) => m.timestamp), [1,2,3,4,5,6,7,8,9,10]);
  assert.deepEqual(f.diagnostics, []);
});
