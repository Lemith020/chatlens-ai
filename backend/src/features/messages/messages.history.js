const { readFileSync } = require('node:fs');
const { safeDetails } = require('../../diagnostics');
const normalizeMessageId = require('./messages.identity');
// Compile only trusted local function source in Node. No page-side eval or
// user-provided code: Puppeteer receives a self-contained function as usual.
function withIdentityNormalizer(scan) {
  return new Function('return (...args) => (' + scan.toString() + ')(...args, ' + normalizeMessageId.toString() + ');')();
}

// Locations refer to the operation immediately following each mark, not to an
// inferred private library stack frame. Derive them from this source so edits
// cannot leave stale line numbers. No paths or error stacks enter diagnostics.
const locations = {};
readFileSync(__filename, 'utf8').split(/\r?\n/).forEach((line, index) => {
  const match = line.match(/^\s*mark\('([^']+)'/);
  if (match) locations[match[1]] = index + 2;
});
function shape(value) {
  return { type: typeof value, array: Array.isArray(value), null: value === null,
    undefined: value === undefined, ...(Array.isArray(value) ? { count: value.length } : {}) };
}

// fetchMessages() reads cached Message instances without the library's unbounded
// limit loop. Older batches are raw models (t rather than timestamp).
module.exports = function createHistoryReader(client, Chat, { diagnose = (entry) => console.error(JSON.stringify(entry)) } = {}) {
  return async function read(groupId) {
    let operation;
    let dataShape = {};
    function mark(next, data = {}) { operation = next; dataShape = data; }
    let timer;
    const deadline = Date.now() + 30000;
    const bounded = (promise) => Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(), { name: 'TimeoutError' })), Math.max(1, deadline - Date.now()));
    })]).finally(() => clearTimeout(timer));
    try {
      mark('chat.construct');
      const chat = new Chat(client, { id: { _serialized: groupId } });
      mark('chat.fetchMessages');
      const cached = await bounded(chat.fetchMessages());
      mark('cached.map', { cached: shape(cached) });
      const initial = cached.map((message) => {
        const fields = { record: shape(message) };
        mark('cached.record.id', fields);
        const id = message.id;
        fields.id = shape(id);
        // Copy identity fields explicitly: neither custom toJSON nor property
        // enumerability may discard identity when Puppeteer serializes arguments.
        const address = (part) => part && typeof part === 'object' && !Array.isArray(part)
          ? { _serialized: part._serialized } : part;
        mark('cached.record.id.snapshot', fields);
        const snapshot = id && typeof id === 'object' && !Array.isArray(id) ? {
          _serialized: id._serialized, id: id.id, remote: address(id.remote),
          fromMe: id.fromMe, participant: address(id.participant),
        } : id;
        mark('cached.record.timestamp', fields);
        const timestamp = message.timestamp;
        fields.timestamp = shape(timestamp);
        mark('cached.record.type', fields);
        const type = message.type;
        fields.type = shape(type);
        mark('cached.record.body', fields);
        const body = message.body;
        return { id: snapshot, t: timestamp, type, body };
      });
      mark('history.evaluate', { cached: shape(cached), initial: shape(initial) });
      const result = await bounded(client.pupPage.evaluate(withIdentityNormalizer(async (id, initial, options, normalizeId) => {
        const MAX_SCAN = 500;
        const MAX_LOADS = 5;
        const seen = new Set();
        const seenAliases = new Set();
        const text = [];
        let loads = 0;
        const deadline = Date.now() + Math.min(30000, options.remaining);
        let operation;
        let dataShape = {};
        function shape(value) {
          return { type: typeof value, array: Array.isArray(value), null: value === null,
            undefined: value === undefined, ...(Array.isArray(value) ? { count: value.length } : {}) };
        }
        function mark(next, data = {}) {
          operation = next;
          dataShape = { ...data, scanned: seen.size, returned: text.length, loads };
        }
        async function bounded(operation) {
          let timer;
          try {
            return await Promise.race([operation, new Promise((_, reject) => {
              timer = setTimeout(() => reject(Object.assign(new Error(), { name: 'TimeoutError' })), Math.max(1, deadline - Date.now()));
            })]);
          } finally { clearTimeout(timer); }
        }
        try {
          // Despite the option name, false returns the raw chat; true runs getChatModel serialization.
          mark('getChat');
          const model = await bounded(window.WWebJS.getChat(id, { getAsModel: false }));
          function result(reason, code) {
            // Preserve the reason's operation across final sorting.
            const reasonOperation = operation;
            const reasonShape = dataShape;
            mark('result.sort', { records: shape(text) });
            text.sort((a, b) => {
              mark('result.sort.compare', { leftId: shape(a.id), rightId: shape(b.id), leftTimestamp: shape(a.timestamp), rightTimestamp: shape(b.timestamp) });
              return a.timestamp - b.timestamp || a.id.localeCompare(b.id);
            });
            return { ...(code ? { diagnosticShape: reasonShape } : {}), messages: text, history: { reason, scanned: seen.size, loads,
              ...(code ? { operation: reasonOperation, code } : {}) } };
          }
          mark('scan.initial.map', { initial: shape(initial) });
          let batch = [...initial];
          for (;;) {
            const before = seen.size;
            mark('scan.batch.copy', { batch: shape(batch) });
            batch = [...batch];
            mark('scan.batch.sort', { batch: shape(batch) });
            batch.sort((a, b) => {
              mark('scan.sort.fields', { left: shape(a), right: shape(b), batch: shape(batch) });
              const left = a.t, right = b.t;
              mark('scan.sort.compare', { leftTimestamp: shape(left), rightTimestamp: shape(right), batch: shape(batch) });
              return right - left;
            });
            for (const message of batch) {
              const fields = { batch: shape(batch), record: shape(message) };
              mark('scan.record.id', fields);
              const recordId = message.id;
              fields.id = shape(recordId);
              mark('scan.record.id.fields', fields);
              fields.idFields = {
                serialized: shape(recordId?._serialized), localId: shape(recordId?.id),
                remote: shape(recordId?.remote), fromMe: shape(recordId?.fromMe), participant: shape(recordId?.participant),
              };
              mark('scan.normalize.id', fields);
              const identity = normalizeId(recordId);
              if (seen.size >= MAX_SCAN && !identity.aliases.some((key) => seenAliases.has(key))) return result('scan_limit');
              mark('scan.record.type', fields);
              const type = message.type;
              fields.type = shape(type);
              mark('scan.record.body', fields);
              const body = type === 'chat' ? message.body : undefined;
              fields.body = shape(body);
              mark('scan.record.timestamp', fields);
              const timestamp = message.t;
              fields.timestamp = { ...shape(timestamp), finite: Number.isFinite(timestamp) };
              mark('scan.record.fromMe', fields);
              const normalized = { identity, timestamp, type, body, fromMe: Boolean(recordId.fromMe) };
              mark('scan.validate.text', fields);
              if (type === 'chat' && (typeof body !== 'string' || !Number.isFinite(timestamp))) {
                throw new TypeError('Invalid text record');
              }
              if (identity.aliases.some((key) => seenAliases.has(key))) {
                identity.aliases.forEach((key) => seenAliases.add(key));
                continue;
              }
              if (seen.size >= MAX_SCAN) return result('scan_limit');
              seen.add(identity.key);
              identity.aliases.forEach((key) => seenAliases.add(key));
              mark('scan.text.trim', fields);
              const trimmed = type === 'chat' ? body.trim() : '';
              if (trimmed) {
                mark('scan.text.append', fields);
                text.push({ id: normalized.identity.responseId, groupId: id, timestamp: normalized.timestamp, type: 'chat', body: trimmed, fromMe: normalized.fromMe });
                if (text.length === 10) return result('requested_count');
              }
            }
            mark('history.model.check', { model: shape(model) });
            if (!model?.msgs?.getModelsArray) return result('history_unavailable', 'MODEL_UNAVAILABLE');
            if (seen.size >= MAX_SCAN || loads >= MAX_LOADS) return result('scan_limit');
            if (loads > 0 && seen.size === before) {
              mark('scan.progress', { batch: shape(batch) });
              return result('history_unavailable', 'NO_PROGRESS');
            }
            mark('history.deadline');
            if (Date.now() >= deadline) throw Object.assign(new Error(), { name: 'TimeoutError' });
            loads++;
            mark('loadEarlierMsgs');
            const loaded = await bounded(window.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat: model }));
            dataShape = { ...dataShape, loaded: shape(loaded) };
            // Neither an empty nor an invalid load proves history is exhausted.
            if (!Array.isArray(loaded)) return result('history_unavailable', 'INVALID_LOAD_RESULT');
            if (loaded.length === 0) return result('history_unavailable', 'EMPTY_LOAD');
            batch = loaded;
          }
        } catch (error) {
          const names = ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'TimeoutError', 'ProtocolError', 'TargetCloseError'];
          const codes = ['EACCES', 'EPERM', 'ENOENT', 'EBUSY', 'ECONNREFUSED', 'ETIMEDOUT'];
          return { failure: { operation, name: names.includes(error?.name) ? error.name : 'UnknownError',
            code: codes.includes(error?.code) ? error.code : 'UNKNOWN',
            source: { filename: 'messages.history.js', line: options.locations[operation] }, shape: dataShape } };
        }
      }), chat.id._serialized, initial, { remaining: deadline - Date.now(), locations }));
      if (result.failure) {
        diagnose({ step: 'messages.history', ...result.failure });
        throw Object.assign(new Error('History operation failed'), { reported: true });
      }
      if (result.history.reason === 'history_unavailable') {
        const operation = result.history.operation;
        diagnose({ step: 'messages.history', operation, name: 'Unavailable', code: result.history.code,
          source: { filename: 'messages.history.js', line: locations[operation] },
          shape: result.diagnosticShape });
      }
      const { diagnosticShape, ...response } = result;
      return response;
    } catch (error) {
      if (!error.reported) {
        const { name, code } = safeDetails(error);
        diagnose({ step: 'messages.history', operation, name, code,
          source: { filename: 'messages.history.js', line: locations[operation] }, shape: dataShape });
      }
      throw error;
    }
  };
};
