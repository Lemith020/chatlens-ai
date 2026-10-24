const path = require('node:path');
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
module.exports = {
  host: '127.0.0.1', port,
  authPath: path.resolve(__dirname, '../../.wwebjs_auth'),
  puppeteer: { channel: 'chrome', headless: false, protocolTimeout: 300000 },
};
