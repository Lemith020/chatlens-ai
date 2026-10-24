const express = require('express');
const createGroupsService = require('./features/groups/groups.service');
const createMessagesService = require('./features/messages/messages.service');
const createHistoryReader = require('./features/messages/messages.history');
const { apiError, errorHandler } = require('./middleware/error-handler');
module.exports = function createApp({ client, whatsapp, Chat = require('whatsapp-web.js').Chat }) {
  const app = express();
  const groups = createGroupsService(client, whatsapp);
  const messages = createMessagesService(groups, whatsapp, createHistoryReader(client, Chat));
  app.disable('x-powered-by');
  app.use(require('./middleware/local-api'));
  app.use(express.json({ limit: '4kb', strict: true, inflate: false }));
  app.use('/api', require('./features/whatsapp/whatsapp.routes')(whatsapp));
  app.use('/api/groups', require('./features/groups/groups.routes')(groups));
  app.use('/api', require('./features/messages/messages.routes')(messages));
  app.use((req, res, next) => next(apiError(404, 'NOT_FOUND', 'Route not found.')));
  app.use(errorHandler);
  return app;
};
