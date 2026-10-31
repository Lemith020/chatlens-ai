const config = require('../config');
const { apiError } = require('../middleware/error-handler');
const { schema, buildMessages } = require('../features/analysis/analysis.prompt');
const ENDPOINT = 'http://127.0.0.1:11434/api/chat';
const MAX_RESPONSE_BYTES = 65536;
const invalid = () => apiError(502, 'INVALID_MODEL_OUTPUT', 'Ollama returned invalid analysis.');

module.exports = function createOllamaClient({ fetchImpl = globalThis.fetch, model = config.ollama.model, timeoutMs = 60000 } = {}) {
  if (typeof fetchImpl !== 'function' || typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(model)
      || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error('Invalid Ollama configuration.');
  return {
    async chat(messages) {
      const controller = new AbortController();
      let timer;
      const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(apiError(504, 'OLLAMA_TIMEOUT', 'Ollama request timed out.'));
        }, timeoutMs);
      });
      const request = async () => {
        const response = await fetchImpl(ENDPOINT, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, stream: false, think: false, format: schema, messages: buildMessages(messages) }),
        });
        // Do not read or expose error bodies; /api/chat reports missing models with 404.
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status === 404) throw apiError(503, 'OLLAMA_MODEL_MISSING', 'The configured Ollama model is not installed.');
          throw apiError(503, 'OLLAMA_UNAVAILABLE', 'Ollama is unavailable.');
        }
        const reader = response.body?.getReader();
        if (!reader) throw invalid();
        const cancel = () => { reader.cancel().catch(() => {}); };
        controller.signal.addEventListener('abort', cancel, { once: true });
        if (controller.signal.aborted) cancel();
        const chunks = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_RESPONSE_BYTES) { controller.abort(); throw invalid(); }
            chunks.push(Buffer.from(value));
          }
        } finally {
          controller.signal.removeEventListener('abort', cancel);
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        let envelope;
        try { envelope = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw invalid(); }
        if (envelope?.done !== true || envelope.message?.role !== 'assistant' || typeof envelope.message.content !== 'string'
            || Buffer.byteLength(envelope.message.content) > 32768) throw invalid();
        try { return JSON.parse(envelope.message.content); } catch { throw invalid(); }
      };
      try { return await Promise.race([request(), timeout]); }
      catch (error) {
        if (controller.signal.aborted && error.code !== 'INVALID_MODEL_OUTPUT') throw apiError(504, 'OLLAMA_TIMEOUT', 'Ollama request timed out.');
        if (['OLLAMA_TIMEOUT', 'OLLAMA_MODEL_MISSING', 'OLLAMA_UNAVAILABLE', 'INVALID_MODEL_OUTPUT'].includes(error.code) && error.isApiError) throw error;
        throw apiError(503, 'OLLAMA_UNAVAILABLE', 'Ollama is unavailable.');
      } finally { clearTimeout(timer); }
    },
  };
};
