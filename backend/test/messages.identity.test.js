const test = require('node:test');
const assert = require('node:assert/strict');
const normalize = require('../src/features/messages/messages.identity');
const components = (overrides = {}) => ({ remote: 'synthetic@g.us', fromMe: false, id: 'synthetic-local', ...overrides });

test('identity prefers a nonempty serialized string and namespaces internal keys', () => {
  const result = normalize({ _serialized: 'synthetic-serialized' });
  assert.equal(result.responseId, 'synthetic-serialized');
  assert.deepEqual(JSON.parse(result.key), ['chatlens:message-id:v1', 'serialized', 'synthetic-serialized']);
  const component = normalize(components());
  assert.notEqual(normalize({ _serialized: component.key }).key, component.key);
});

test('component identity is a deterministic JSON tuple with unambiguous field boundaries', () => {
  const first = normalize(components());
  assert.deepEqual(first, normalize(components()));
  assert.deepEqual(JSON.parse(first.key), ['chatlens:message-id:v1', 'components', 'synthetic@g.us', false, 'synthetic-local', null]);
  assert.equal(first.responseId, first.key);
  assert.notEqual(normalize(components({ remote: 'a_b', id: 'c' })).key, normalize(components({ remote: 'a', id: 'b_c' })).key);
  assert.notEqual(first.key, normalize(components({ remote: 'other@g.us' })).key);
  assert.notEqual(first.key, normalize(components({ fromMe: true })).key);
  assert.notEqual(first.key, normalize(components({ id: 'other-local' })).key);
});

test('participant identity distinguishes group senders and accepts explicit serialized address models', () => {
  const a = normalize(components({ participant: 'sender-a@c.us' }));
  const b = normalize(components({ participant: 'sender-b@c.us' }));
  assert.notEqual(a.key, b.key);
  assert.notEqual(a.key, normalize(components()).key);
  assert.equal(a.key, normalize(components({ remote: { _serialized: 'synthetic@g.us' }, participant: { _serialized: 'sender-a@c.us' } })).key);
});

test('serialized and component representations share an alias for overlapping batches', () => {
  const plain = normalize(components());
  const serialized = normalize(components({ _serialized: 'synthetic-serialized' }));
  assert.ok(serialized.aliases.includes(plain.key));
  assert.equal(serialized.responseId, 'synthetic-serialized');
});

test('genuinely malformed IDs fail without coercion, random identity, or body fallback', () => {
  const malformed = [null, undefined, [], 'synthetic', {}, { id: 'only-local' },
    components({ remote: '' }), components({ remote: ' ' }), components({ remote: {} }),
    components({ fromMe: undefined }), components({ fromMe: 'false' }), components({ fromMe: 0 }),
    components({ id: '' }), components({ id: ' ' }), components({ id: 123 }), components({ id: {} }),
    components({ participant: '' }), components({ participant: {} }), { _serialized: {} }, { _serialized: '' }];
  for (const value of malformed) assert.throws(() => normalize(value), TypeError);
  const poison = { toString() { assert.fail('must not stringify arbitrary objects'); } };
  assert.throws(() => normalize(components({ remote: poison })), TypeError);
  assert.throws(() => normalize(components({ id: poison })), TypeError);
});
