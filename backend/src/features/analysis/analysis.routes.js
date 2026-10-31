const express = require('express');
const { apiError } = require('../../middleware/error-handler');
const { limits } = require('./analysis.service');
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fields = (v, required, optional = []) => object(v) && required.every((k) => Object.hasOwn(v, k)) && Object.keys(v).every((k) => [...required, ...optional].includes(k));
const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const safeErrors = {
  OLLAMA_UNAVAILABLE: 'Ollama is unavailable.', OLLAMA_TIMEOUT: 'Ollama request timed out.',
  OLLAMA_MODEL_MISSING: 'The configured Ollama model is not installed.', INVALID_MODEL_OUTPUT: 'Ollama returned invalid analysis.',
};
module.exports = function analysisRoutes(analysis, validateGroupId) {
  const router = express.Router();
  let active = false;
  // A separate, bounded snapshot budget; all other routes retain their 4 KB limit.
  router.post('/', express.json({ limit: '192kb', strict: true, inflate: false }), async (req, res) => {
    if (!req.is('application/json')) throw apiError(415, 'JSON_REQUIRED', 'Use application/json.');
    const invalid = () => apiError(400, 'INVALID_ANALYSIS_INPUT', 'Provide 1 to 5 unique groups with valid message snapshots and history.');
    if (!fields(req.body, ['groups']) || !Array.isArray(req.body.groups) || req.body.groups.length < 1 || req.body.groups.length > 5) throw invalid();
    const seen = new Set();
    let total = 0;
    for (const group of req.body.groups) {
      if (!fields(group, ['groupId', 'messages', 'history'])) throw invalid();
      validateGroupId(group.groupId);
      if (seen.has(group.groupId)) throw invalid();
      seen.add(group.groupId);
      const h = group.history;
      if (!fields(h, ['reason', 'scanned', 'loads'], ['operation', 'code'])
          || !['requested_count', 'scan_limit', 'history_unavailable'].includes(h.reason)
          || !Number.isInteger(h.scanned) || h.scanned < 0 || h.scanned > 500
          || !Number.isInteger(h.loads) || h.loads < 0 || h.loads > 5
          || ['operation', 'code'].some((k) => Object.hasOwn(h, k) && !text(h[k], 100))) throw invalid();
      if (!Array.isArray(group.messages) || group.messages.length > limits.messages || h.scanned < group.messages.length) throw invalid();
      const ids = new Set();
      for (const m of group.messages) {
        if (!fields(m, ['id', 'groupId', 'timestamp', 'type', 'body', 'fromMe'])
            || !text(m.id, limits.idChars) || ids.has(m.id) || m.groupId !== group.groupId
            || !Number.isSafeInteger(m.timestamp) || m.timestamp < 0 || m.type !== 'chat'
            || typeof m.fromMe !== 'boolean' || !text(m.body, limits.bodyChars)) throw invalid();
        ids.add(m.id);
      }
      if (Buffer.byteLength(JSON.stringify(group.messages.map(({ id, body }) => ({ id, body })))) > limits.inputBytes) throw invalid();
      total += group.messages.length;
    }
    if (!total) throw invalid();
    if (active) throw apiError(429, 'ANALYSIS_BUSY', 'Another analysis request is in progress.');
    active = true;
    try {
      const results = [];
      for (const group of req.body.groups) {
        const base = { groupId: group.groupId, history: group.history, scope: 'retrieved_messages_only' };
        if (!group.messages.length) { results.push({ ...base, skipped: 'empty_group' }); continue; }
        try { results.push({ ...base, analysis: await analysis.analyze(group.messages) }); }
        catch (error) {
          const code = Object.hasOwn(safeErrors, error?.code) ? error.code : 'ANALYSIS_FAILED';
          results.push({ ...base, error: { code, message: safeErrors[code] || 'Analysis could not be completed.' } });
        }
      }
      res.status(results.some((r) => r.error) ? 207 : 200).json({ results });
    } finally { active = false; }
  });
  router.use((error, req, res, next) => {
    if (error.type === 'entity.too.large') return next(apiError(413, 'REQUEST_TOO_LARGE', 'Analysis snapshot exceeds 192 KB.'));
    next(error);
  });
  return router;
};
