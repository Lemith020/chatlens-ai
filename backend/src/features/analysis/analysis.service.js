const createOllamaClient = require('../../integrations/ollama.client');
const { apiError } = require('../../middleware/error-handler');
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
      const output = await client.chat(data);
      const invalid = () => apiError(502, 'INVALID_MODEL_OUTPUT', 'Ollama returned invalid analysis.');
      if (!keys(output, ['summary', 'importantUpdates', 'tasks']) || typeof output.summary !== 'string' || output.summary.length > 4000
          || Buffer.byteLength(JSON.stringify(output)) > limits.outputBytes) throw invalid();
      for (const field of ['importantUpdates', 'tasks']) {
        const task = field === 'tasks';
        if (!Array.isArray(output[field]) || output[field].length > limits.items) throw invalid();
        for (const entry of output[field]) {
          if (!keys(entry, task ? ['text', 'messageIds', 'deadlineText'] : ['text', 'messageIds']) || !text(entry.text, 2000)
              || !Array.isArray(entry.messageIds) || entry.messageIds.length < 1 || entry.messageIds.length > limits.messages
              || new Set(entry.messageIds).size !== entry.messageIds.length || entry.messageIds.some((id) => !ids.has(id))) throw invalid();
          if (task && entry.deadlineText !== null && (!text(entry.deadlineText, 500)
              || !data.some((message) => entry.messageIds.includes(message.id) && message.body.includes(entry.deadlineText)))) throw invalid();
        }
      }
      return output;
    },
  };
};
module.exports.limits = limits;
