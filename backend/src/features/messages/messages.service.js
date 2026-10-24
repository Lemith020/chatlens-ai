const { apiError } = require('../../middleware/error-handler');
module.exports = function createMessagesService(groups, whatsapp, readHistory) {
  let active = false;
  function validate(ids) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 5 || new Set(ids).size !== ids.length) {
      throw apiError(400, 'INVALID_SELECTION', 'Select 1 to 5 unique group IDs.');
    }
    ids.forEach(groups.validateId);
  }
  async function run(ids, multiple) {
    validate(ids);
    whatsapp.requireReady();
    if (active) throw apiError(429, 'FETCH_BUSY', 'Another message request is in progress.');
    active = true;
    try {
      const available = await groups.list();
      const results = [];
      for (const groupId of ids) {
        try {
          if (!available.some((group) => group.id === groupId)) {
            throw apiError(404, 'GROUP_NOT_FOUND', 'Group not found.');
          }
          whatsapp.requireReady();
          let result;
          try { result = await readHistory(groupId); }
          catch { throw apiError(502, 'MESSAGE_FETCH_FAILED', 'Message history could not be fetched.'); }
          results.push({ groupId, ...result });
        } catch (error) {
          if (!multiple) throw error;
          results.push({ groupId, error: {
            code: error.isApiError ? error.code : 'INTERNAL_ERROR',
            message: error.isApiError ? error.message : 'The request could not be completed.',
          } });
        }
      }
      return multiple ? { results } : results[0];
    } finally { active = false; }
  }
  return { recent: (id) => run([id], false), multiple: (ids) => run(ids, true) };
};
