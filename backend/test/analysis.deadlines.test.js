const test = require('node:test');
const assert = require('node:assert/strict');
const createService = require('../src/features/analysis/analysis.service');
const { syntheticBatch } = require('../scripts/analysis-batch-synthetic');
const { schemaForMessages } = require('../src/features/analysis/analysis.prompt');
const response = (tasks) => new Response(JSON.stringify({ done: true, done_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ summary: 'Three tasks share an explicit deadline.', importantUpdates: [], tasks }) } }));

test('deadline-first generation preserves exact alias enums and all required fields', () => {
  const format = schemaForMessages([{ id: 'm1', body: 'Synthetic.' }, { id: 'm2', body: 'Synthetic.' }]);
  const task = format.properties.tasks.items;
  assert.deepEqual(Object.keys(task.properties), ['text', 'deadlineText', 'messageIds']);
  assert.deepEqual(new Set(task.required), new Set(['text', 'messageIds', 'deadlineText']));
  assert.deepEqual(task.properties.messageIds.items.enum, ['m1', 'm2']);
});

test('all three explicit shared deadlines require action and supporting source aliases', async (t) => {
  const messages = syntheticBatch();
  const tasks = ['Write introduction.', 'Prepare chart.', 'Review references.'].map((text) => ({ text, deadlineText: 'by Friday at 5 PM', messageIds: ['m5', 'm6'] }));
  const service = createService({ fetchImpl: async () => response(tasks) });
  const result = await service.analyze(messages);
  for (const item of result.tasks) {
    assert.deepEqual(item.messageIds, [messages[4].id, messages[5].id]);
    assert.equal(item.deadlineText, 'by Friday at 5 PM');
  }
  const warn = console.warn;
  console.warn = () => {};
  t.after(() => { console.warn = warn; });
  for (const index of [0, 1, 2]) {
    const missing = tasks.map((item, i) => i === index ? { ...item, messageIds: ['m5'] } : item);
    await assert.rejects(createService({ fetchImpl: async () => response(missing) }).analyze(messages), (error) => error.reasonCode === 'INVALID_DEADLINE_EVIDENCE' && error.fieldPath === `tasks[${index}].deadlineText`);
  }
  const rewritten = [{ ...tasks[0], deadlineText: 'Friday 17:00' }];
  await assert.rejects(createService({ fetchImpl: async () => response(rewritten) }).analyze(messages), (error) => error.reasonCode === 'INVALID_DEADLINE_EVIDENCE');
});

test('ambiguous association instructs null without attaching a neighboring date source', async () => {
  const messages = [{ id: 'fake-action', body: 'Please prepare the chart.' }, { id: 'fake-uncertain', body: 'Friday at 5 PM was mentioned, but I do not know which activity it concerns.' }];
  const service = createService({ fetchImpl: async (url, options) => {
    const prompt = JSON.parse(options.body).messages[0].content;
    assert.match(prompt, /association between a date and a task is ambiguous, deadlineText must be null/);
    return response([{ text: 'Prepare chart.', deadlineText: null, messageIds: ['m1'] }]);
  } });
  const output = await service.analyze(messages);
  assert.equal(output.tasks[0].deadlineText, null);
  assert.deepEqual(output.tasks[0].messageIds, ['fake-action']);
});
