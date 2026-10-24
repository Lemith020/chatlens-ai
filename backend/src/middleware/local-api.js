const { apiError } = require('./error-handler');
module.exports = function localApi(req, res, next) {
  res.set('Cache-Control', 'no-store');
  const authority = '127.0.0.1:' + req.socket.localPort;
  if (req.get('host') !== authority) return next(apiError(403, 'LOCAL_ONLY', 'Use the local API address.'));
  const origin = req.get('origin');
  if ((origin && origin !== 'http://' + authority) || req.get('sec-fetch-site') === 'cross-site') {
    return next(apiError(403, 'ORIGIN_DENIED', 'Cross-origin requests are not allowed.'));
  }
  // CORS is deliberately disabled. A future dashboard must use a same-origin proxy.
  next();
};
