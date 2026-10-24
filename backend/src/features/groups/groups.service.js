const { apiError } = require('../../middleware/error-handler');
module.exports = function createGroupsService(client, whatsapp) {
  function validateId(id) {
    if (typeof id !== 'string' || id.length > 80 || !/^\d+(?:-\d+)?@g\.us$/.test(id)) {
      throw apiError(400, 'INVALID_GROUP_ID', 'A valid WhatsApp group ID is required.');
    }
  }
  async function list() {
    whatsapp.requireReady();
    // Preserve the tested WhatsApp Web collection workaround.
    return client.pupPage.evaluate(() => {
      const chats = window.require('WAWebCollections').Chat.getModelsArray();
      return chats.filter((chat) => chat.id?._serialized?.endsWith('@g.us')).map((chat) => ({
        id: chat.id._serialized,
        name: chat.name || chat.formattedTitle || 'Unnamed group',
        unreadCount: chat.unreadCount ?? 0,
      }));
    });
  }
  return {
    list,
    validateId,
    async requireGroup(id) {
      if (typeof id !== 'string' || !/^\d+(?:-\d+)?@g\.us$/.test(id)) {
        throw apiError(400, 'INVALID_GROUP_ID', 'A valid WhatsApp group ID is required.');
      }
      const group = (await list()).find((item) => item.id === id);
      if (!group) throw apiError(404, 'GROUP_NOT_FOUND', 'Group not found.');
      return group;
    },
  };
};
