const { Router } = require('express');
module.exports = function whatsappRoutes(whatsapp) {
  const router = Router();
  router.get('/status', (req, res) => res.json({ status: 'ok', whatsapp: whatsapp.getStatus() }));
  return router;
};
