const { Router } = require('express');
module.exports = function groupsRoutes(groups) {
  const router = Router();
  router.get('/', async (req, res) => res.json({ groups: await groups.list() }));
  return router;
};
