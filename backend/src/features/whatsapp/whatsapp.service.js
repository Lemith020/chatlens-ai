const qrcode = require('qrcode-terminal');
const { apiError } = require('../../middleware/error-handler');
module.exports = function createWhatsAppService(client, { displayQr = (qr) => qrcode.generate(qr, { small: true }), shutdownMs = 5000 } = {}) {
  let status = 'idle';
  let startPromise;
  let stopPromise;
  let stopping = false;
  let monitoredPage;
  const transition = (next) => { if (!stopping) status = next; };
  client.on('qr', (qr) => {
    if (stopping) return;
    transition('qr_required');
    console.log('Scan using WhatsApp > Linked devices:');
    displayQr(qr);
  });
  client.on('authenticated', () => {
    transition('authenticated');
    if (client.pupPage && monitoredPage !== client.pupPage) {
      monitoredPage = client.pupPage;
      monitoredPage.on('pageerror', () => console.error('WhatsApp browser page error.'));
      monitoredPage.on('error', () => transition('error'));
      monitoredPage.on('close', () => transition('disconnected'));
    }
  });
  client.on('ready', () => transition('ready'));
  client.on('auth_failure', () => transition('auth_failure'));
  client.on('disconnected', () => transition('disconnected'));
  async function destroyBounded() {
    let timer;
    try {
      await Promise.race([
        Promise.resolve().then(() => client.destroy()),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error('Browser cleanup timed out'), { name: 'TimeoutError', code: 'SHUTDOWN_TIMEOUT' })), shutdownMs);
        }),
      ]);
    } catch (error) {
      // Only terminate the browser process owned by this client, never other Chrome instances.
      try { client.pupBrowser?.process?.()?.kill('SIGKILL'); }
      catch (killError) {
        const cleanupError = new Error('Browser cleanup did not complete.', { cause: error });
        cleanupError.forceCloseError = killError;
        throw cleanupError;
      }
      throw error;
    } finally { clearTimeout(timer); }
  }
  return {
    getStatus: () => ({ status, ready: status === 'ready' && !stopping }),
    requireReady() {
      if (status !== 'ready' || stopping) throw apiError(503, 'WHATSAPP_NOT_READY', 'WhatsApp is not ready.');
    },
    start() {
      if (stopping) return Promise.reject(new Error('Service is stopping'));
      if (!startPromise) {
        status = 'initializing';
        startPromise = Promise.resolve().then(() => { if (!stopping) return client.initialize(); }).then(async () => {
          // Initialization can finish after a shutdown request; close that late browser too.
          if (stopping) await destroyBounded();
        }).catch(async (error) => {
          transition('error');
          const startupError = new Error('WhatsApp startup failed.', { cause: error });
          try { await destroyBounded(); }
          catch (cleanupError) { startupError.cleanupError = cleanupError; }
          throw startupError;
        });
      }
      return startPromise;
    },
    stop() {
      if (!stopPromise) {
        stopping = true;
        status = 'stopping';
        stopPromise = destroyBounded().then(() => { status = 'stopped'; }, (error) => {
          status = 'error'; throw new Error('Browser cleanup did not complete.', { cause: error });
        });
      }
      return stopPromise;
    },
  };
};
