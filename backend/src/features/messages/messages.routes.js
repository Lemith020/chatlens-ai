const { Router } = require('express');
const { apiError } = require('../../middleware/error-handler');
module.exports = function messagesRoutes(messages) {
  const router = Router();
  router.get('/groups/:groupId/messages', async (req, res) => {
    res.json(await messages.recent(req.params.groupId));
  });
  router.post('/messages', async (req, res) => {
    if (!req.is('application/json')) throw apiError(415, 'JSON_REQUIRED', 'Use application/json.');
    if (!req.body || Object.keys(req.body).some((key) => key !== 'groupIds')) {
      throw apiError(400, 'INVALID_SELECTION', 'Provide only groupIds.');
    }
    const result = await messages.multiple(req.body.groupIds);
    res.status(result.results.some((item) => item.error) ? 207 : 200).json(result);
  });
  return router;
};
