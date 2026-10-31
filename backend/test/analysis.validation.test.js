const test = require('node:test');
const assert = require('node:assert/strict');
const createService = require('../src/features/analysis/analysis.service');
const { invalidAnalysis } = require('../src/features/analysis/analysis.errors');
const { syntheticBatch } = require('../scripts/analysis-batch-synthetic');
const output = () => ({ summary: 'Three assigned tasks share a deadline.', importantUpdates: [], tasks: [] });
const response = (result, extra = {}) => new Response(JSON.stringify({ done: true, done_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(result, (key, value) => key === 'messageIds' && Array.isArray(value) ? value.map((id) => {
  if (id === 'PRIVATE_SENTINEL_ID') return 'm1';
  const index = syntheticBatch().findIndex((m) => m.id === id);
  return index < 0 ? id : `m${index + 1}`;
}) : value) }, ...extra }));

test('each rejection emits only a fixed reason and generated field path, never private values', async (t) => {
  const warnings = [];
  const original = console.warn;
  console.warn = (value) => warnings.push(JSON.parse(value));
  t.after(() => { console.warn = original; });
  const messages = [{ id: 'PRIVATE_SENTINEL_ID', body: 'PRIVATE_SENTINEL_BODY' }];
  const cases = [
    [() => new Response('PRIVATE_SENTINEL_RAW'), 'JSON_FAILURE', 'envelope'],
    [() => response(output(), { done_reason: 'length' }), 'COMPLETION_FAILURE', 'envelope'],
    [() => response(output(), { message: { role: 'user', content: 'PRIVATE_SENTINEL_RAW' } }), 'ENVELOPE_FAILURE', 'envelope.message.content'],
    [() => response(output(), { message: { role: 'assistant', content: 'PRIVATE_SENTINEL_RAW' } }), 'JSON_FAILURE', 'envelope.message.content'],
    [() => response({ ...output(), summary: ' \n' }), 'EMPTY_SUMMARY', 'summary'],
    [() => response({ ...output(), unexpected: 'PRIVATE_SENTINEL_VALUE' }), 'SCHEMA_FAILURE', 'output'],
    [() => response({ ...output(), tasks: [{ text: 'PRIVATE_SENTINEL_TEXT', messageIds: ['PRIVATE_SENTINEL_UNKNOWN'], deadlineText: null }] }), 'UNKNOWN_MESSAGE_REFERENCE', 'tasks[0].messageIds'],
    [() => response({ ...output(), tasks: [{ text: 'Task', messageIds: ['PRIVATE_SENTINEL_ID'], deadlineText: 'PRIVATE_SENTINEL_DEADLINE' }] }), 'INVALID_DEADLINE_EVIDENCE', 'tasks[0].deadlineText'],
    [() => new Response('x'.repeat(65537)), 'OUTPUT_SIZE_LIMIT', 'envelope'],
    [() => response(output(), { message: { role: 'assistant', content: 'x'.repeat(32769) } }), 'OUTPUT_SIZE_LIMIT', 'envelope.message.content'],
  ];
  for (const [fetchResponse, reasonCode, fieldPath] of cases) {
    warnings.length = 0;
    await assert.rejects(createService({ fetchImpl: async () => fetchResponse() }).analyze(messages), (error) => {
      assert.equal(error.code, 'INVALID_MODEL_OUTPUT');
      assert.equal(error.reasonCode, reasonCode);
      assert.equal(error.fieldPath, fieldPath);
      assert.equal(JSON.stringify(error).includes('PRIVATE_SENTINEL'), false);
      return true;
    });
    assert.deepEqual(warnings, [{ reasonCode, fieldPath }]);
    assert.equal(JSON.stringify(warnings).includes('PRIVATE_SENTINEL'), false);
  }
  warnings.length = 0;
  invalidAnalysis('PRIVATE_SENTINEL_REASON', 'PRIVATE_SENTINEL_PATH');
  assert.deepEqual(warnings, [{ reasonCode: 'SCHEMA_FAILURE', fieldPath: 'output' }]);
});

test('three tasks retain complex IDs and shared deadline evidence; missing evidence is still rejected', async (t) => {
  const messages = syntheticBatch();
  const tasks = ['Write the introduction.', 'Prepare the chart.', 'Review the references.'].map((text) => ({
    text, messageIds: [messages[4].id, messages[5].id], deadlineText: 'by Friday at 5 PM',
  }));
  const result = { ...output(), tasks };
  let calls = 0;
  const service = createService({ fetchImpl: async (url, options) => {
    calls++;
    const request = JSON.parse(options.body);
    assert.deepEqual(JSON.parse(request.messages[1].content).conversationData, messages.map((m, i) => ({ ...m, id: `m${i + 1}` })));
    assert.match(request.messages[0].content, /BOTH its action message and its deadline message/);
    return response(result);
  } });
  assert.deepEqual(await service.analyze(messages), result);
  assert.equal(calls, 1);
  const original = console.warn;
  console.warn = () => {};
  t.after(() => { console.warn = original; });
  for (const bad of [
    { ...tasks[0], messageIds: [messages[4].id] },
    { ...tasks[0], deadlineText: 'Friday 17:00' },
    { ...tasks[0], messageIds: [messages[4].id, messages[8].id] },
  ]) {
    await assert.rejects(createService({ fetchImpl: async () => response({ ...result, tasks: [bad] }) }).analyze(messages), (error) => error.reasonCode === 'INVALID_DEADLINE_EVIDENCE');
  }
});
