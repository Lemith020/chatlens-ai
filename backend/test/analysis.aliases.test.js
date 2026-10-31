const test = require('node:test');
const assert = require('node:assert/strict');
const createService = require('../src/features/analysis/analysis.service');
const { schema } = require('../src/features/analysis/analysis.prompt');
const reply = (ids) => new Response(JSON.stringify({ done: true, done_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ summary: 'Submit the synthetic report tomorrow.', importantUpdates: [{ text: 'Report requested.', messageIds: ids }], tasks: [{ text: 'Submit report.', messageIds: ids, deadlineText: 'tomorrow' }] }) } }));

test('concurrent calls isolate aliases and schemas and map complex original IDs exactly', async () => {
  const a = [{ id: 'false_900000000000-1000000000@g.us_COMPLEX_A_900000000001@c.us', body: 'Submit the report tomorrow.' }];
  // An original ID that resembles an alias must still be remapped exactly once.
  const b = [{ id: 'm2', body: 'Submit the report tomorrow.' }, { id: 'complex_B:/@fake.us', body: 'Extra synthetic context.' }];
  const requests = [];
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const service = createService({ fetchImpl: async (url, options) => {
    const request = JSON.parse(options.body);
    requests.push(request);
    if (requests.length === 1) await wait;
    else release();
    return reply(['m1']);
  } });
  const results = await Promise.all([service.analyze(a), service.analyze(b)]);
  for (const [index, messages] of [a, b].entries()) {
    const aliases = messages.map((m, i) => `m${i + 1}`);
    assert.deepEqual(JSON.parse(requests[index].messages[1].content).conversationData, messages.map((m, i) => ({ id: aliases[i], body: m.body })));
    for (const field of ['importantUpdates', 'tasks']) {
      assert.deepEqual(requests[index].format.properties[field].items.properties.messageIds.items.enum, aliases);
      assert.deepEqual(results[index][field][0].messageIds, [messages[0].id]);
    }
    assert.equal(optionsContainOriginal(requests[index], messages.filter((m) => m.id !== 'm2')), false);
  }
  assert.equal(schema.properties.tasks.items.properties.messageIds.items.enum, undefined);
});
function optionsContainOriginal(request, messages) {
  return messages.some((m) => JSON.stringify(request).includes(m.id));
}

test('unknown aliases are rejected exactly, including original IDs and punctuation variants', async (t) => {
  const messages = [{ id: 'complex_original_id@g.us', body: 'Submit report tomorrow.' }];
  const originalWarn = console.warn;
  console.warn = () => {};
  t.after(() => { console.warn = originalWarn; });
  for (const id of ['m0', 'm2', 'm01', 'M1', 'm1.', ' m1', 'complex_original_id@g.us']) {
    const service = createService({ fetchImpl: async () => reply(['m1', id]) });
    await assert.rejects(service.analyze(messages), (error) => error.reasonCode === 'UNKNOWN_MESSAGE_REFERENCE' && error.fieldPath === 'importantUpdates[0].messageIds');
  }
});

test('original-ID expansion retains the final output byte limit', async (t) => {
  const originalWarn = console.warn;
  console.warn = () => {};
  t.after(() => { console.warn = originalWarn; });
  const messages = Array.from({ length: 50 }, (_, i) => ({ id: String(i).padStart(3, '0') + 'x'.repeat(240), body: 'Synthetic context.' }));
  const aliases = messages.map((m, i) => `m${i + 1}`);
  const result = { summary: 'Synthetic context.', importantUpdates: Array.from({ length: 10 }, () => ({ text: 'Synthetic update.', messageIds: aliases })), tasks: [] };
  const service = createService({ fetchImpl: async () => new Response(JSON.stringify({ done: true, done_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(result) } })) });
  await assert.rejects(service.analyze(messages), (error) => error.reasonCode === 'OUTPUT_SIZE_LIMIT' && error.fieldPath === 'output');
});
