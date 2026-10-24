const { Client, LocalAuth } = require('whatsapp-web.js');
const config = require('../../config');
// Node module caching provides one shared client.
module.exports = new Client({
  authStrategy: new LocalAuth({ dataPath: config.authPath }),
  puppeteer: config.puppeteer,
});
