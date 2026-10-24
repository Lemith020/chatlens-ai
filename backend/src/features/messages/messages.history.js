// Isolated compatibility adapter: mirrors Chat.fetchMessages without its unbounded loop.
// Keep the tested Chat ID construction; never open a chat or change read state.
module.exports = function createHistoryReader(client, Chat) {
  return async function read(groupId) {
    const chat = new Chat(client, { id: { _serialized: groupId } });
    return client.pupPage.evaluate(async (id) => {
      const MAX_SCAN = 500;
      const MAX_LOADS = 5;
      const DEADLINE_MS = 30000;
      const seen = new Set();
      const text = [];
      let loads = 0;
      const deadline = Date.now() + DEADLINE_MS;
      async function bounded(operation) {
        let timer;
        try {
          return await Promise.race([
            operation,
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error('History operation timed out')), Math.max(1, deadline - Date.now()));
            }),
          ]);
        } finally { clearTimeout(timer); }
      }
      const model = await bounded(window.WWebJS.getChat(id, { getAsModel: false }));
      if (!model?.msgs?.getModelsArray) {
        return { messages: [], history: { reason: 'history_unavailable', scanned: 0, loads: 0 } };
      }
      function result(reason) {
        text.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
        return { messages: text, history: { reason, scanned: seen.size, loads } };
      }
      let batch = model.msgs.getModelsArray();
      for (;;) {
        const before = seen.size;
        // Each history batch is processed newest first, then the final view is chronological.
        batch = [...batch].sort((a, b) => b.t - a.t);
        for (const message of batch) {
          const key = message.id?._serialized;
          if (!key || seen.has(key)) continue;
          if (seen.size >= MAX_SCAN) return result('scan_limit');
          seen.add(key);
          if (message.type === 'chat' && typeof message.body === 'string' &&
              message.body.trim() && Number.isFinite(message.t)) {
            text.push({ id: key, groupId: id, timestamp: message.t, type: 'chat',
              body: message.body.trim(), fromMe: Boolean(message.id.fromMe) });
            if (text.length === 10) return result('requested_count');
          }
        }
        if (seen.size >= MAX_SCAN || loads >= MAX_LOADS) return result('scan_limit');
        if (loads > 0 && seen.size === before) return result('history_unavailable');
        if (Date.now() >= deadline) throw new Error('History operation timed out');
        loads++;
        const loaded = await bounded(window.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat: model }));
        // An empty load does not prove that all historical messages are accessible.
        if (!Array.isArray(loaded) || loaded.length === 0) return result('history_unavailable');
        batch = loaded;
      }
    }, chat.id._serialized);
  };
};
