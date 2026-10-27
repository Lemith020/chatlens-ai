const config = require('./config');
module.exports = function startServer(app, whatsapp, onFailure = () => {}, port = config.port) {
  let primaryFailure;
  function report(step, error) {
    if (!primaryFailure) primaryFailure = { step, error };
    onFailure(step, error);
    if (error?.cleanupError) {
      onFailure('whatsapp.start.cleanup', error.cleanupError);
      if (error.cleanupError.forceCloseError) onFailure('browser.force_close', error.cleanupError.forceCloseError);
    }
    // stop() wraps the bounded cleanup cause.
    const forceCloseError = error?.forceCloseError || error?.cause?.forceCloseError;
    if (forceCloseError) onFailure('browser.force_close', forceCloseError);
  }
  const server = app.listen(port, config.host, (error) => {
    if (error || shutdownPromise) return;
    console.log('ChatLens AI API: http://127.0.0.1:' + server.address().port);
    Promise.resolve().then(() => whatsapp.start()).catch((error) => {
      report('whatsapp.start', error);
      shutdown();
    });
  });
  let shutdownPromise;
  function shutdown() {
    if (!shutdownPromise) {
      // Defer both operations until the shared promise is assigned.
      shutdownPromise = Promise.all([
        Promise.resolve().then(() => new Promise((resolve) => {
          server.close((error) => {
            if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') report('http.close', error);
            resolve();
          });
          server.closeAllConnections();
        })).catch((error) => report('http.close', error)),
        Promise.resolve().then(() => whatsapp.stop()).catch((error) => report('whatsapp.stop', error)),
      ]);
    }
    return shutdownPromise;
  }
  server.on('error', (error) => { report('http.start', error); shutdown(); });
  return { server, shutdown, getFailure: () => primaryFailure };
};

//check  
