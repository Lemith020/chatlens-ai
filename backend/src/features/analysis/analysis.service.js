const createOllamaClient = require('../../integrations/ollama.client');
const { apiError } = require('../../middleware/error-handler');
const { invalidAnalysis: invalid } = require('./analysis.errors');
const limits = Object.freeze({ messages: 50, idChars: 256, bodyChars: 8000, inputBytes: 32768, outputBytes: 32768, items: 50 });
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, expected) => record(value) && Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

module.exports = function createAnalysisService(options = {}) {
  const client = createOllamaClient(options);
  return {
    async analyze(messages) {
      const badInput = () => apiError(400, 'INVALID_ANALYSIS_INPUT', 'Supply 1 to 50 unique messages within analysis limits.');
      if (!Array.isArray(messages) || messages.length < 1 || messages.length > limits.messages) throw badInput();
      const ids = new Set();
      const data = Array.from(messages, (message) => {
        if (!record(message) || !text(message.id, limits.idChars) || !text(message.body, limits.bodyChars)
            || ids.has(message.id)) throw badInput();
        ids.add(message.id);
        // Project existing message records onto only the fields required by analysis.
        return { id: message.id, body: message.body };
      });
      if (Buffer.byteLength(JSON.stringify(data)) > limits.inputBytes) throw badInput();
      // These maps belong to this invocation only, including concurrent calls.
      const originals = new Map(data.map((message, index) => [`m${index + 1}`, message.id]));
      const modelData = data.map((message, index) => ({ id: `m${index + 1}`, body: message.body }));
      const output = await client.chat(modelData);
      if (Buffer.byteLength(JSON.stringify(output)) > limits.outputBytes) throw invalid('OUTPUT_SIZE_LIMIT', 'output');
      if (!keys(output, ['summary', 'importantUpdates', 'tasks'])) throw invalid('SCHEMA_FAILURE', 'output');
      if (typeof output.summary === 'string' && !output.summary.trim()) throw invalid('EMPTY_SUMMARY', 'summary');
      if (!text(output.summary, 4000)) throw invalid('SCHEMA_FAILURE', 'summary');
      for (const field of ['importantUpdates', 'tasks']) {
        const task = field === 'tasks';
        if (!Array.isArray(output[field]) || output[field].length > limits.items) throw invalid('SCHEMA_FAILURE', field);
        for (const [index, entry] of output[field].entries()) {
          const fieldPath = `${field}[${index}]`;
          if (!keys(entry, task ? ['text', 'messageIds', 'deadlineText'] : ['text', 'messageIds']) || !text(entry.text, 2000)
              || !Array.isArray(entry.messageIds) || entry.messageIds.length < 1 || entry.messageIds.length > limits.messages
              || new Set(entry.messageIds).size !== entry.messageIds.length || entry.messageIds.some((id) => typeof id !== 'string')) throw invalid('SCHEMA_FAILURE', fieldPath);
          if (entry.messageIds.some((id) => !originals.has(id))) throw invalid('UNKNOWN_MESSAGE_REFERENCE', `${fieldPath}.messageIds`);
          if (task && entry.deadlineText !== null && (!text(entry.deadlineText, 500)
              || !modelData.some((message) => entry.messageIds.includes(message.id) && message.body.includes(entry.deadlineText)))) throw invalid('INVALID_DEADLINE_EVIDENCE', `${fieldPath}.deadlineText`);
        }
      }
      // Map only after every finding has passed alias and evidence validation.
      const result = { ...output };
      for (const field of ['importantUpdates', 'tasks']) {
        result[field] = output[field].map((entry) => ({ ...entry, messageIds: entry.messageIds.map((id) => originals.get(id)) }));
      }
      if (Buffer.byteLength(JSON.stringify(result)) > limits.outputBytes) throw invalid('OUTPUT_SIZE_LIMIT', 'output');
      return result;
    },
  };
};
module.exports.limits = limits;
