function apiError(status, code, message) {
  return Object.assign(new Error(message), { status, code, isApiError: true });
}
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'encoding.unsupported') error = apiError(415, 'ENCODING_UNSUPPORTED', 'Compressed request bodies are not supported.');
  if (error.type === 'entity.too.large') error = apiError(413, 'REQUEST_TOO_LARGE', 'Request exceeds 4 KB.');
  if (error.type === 'entity.parse.failed') error = apiError(400, 'INVALID_JSON', 'Malformed JSON request.');
  const known = error.isApiError === true;
  res.status(known ? error.status : 500).json({ error: {
    code: known ? error.code : 'INTERNAL_ERROR',
    message: known ? error.message : 'The request could not be completed.',
  } });
}
module.exports = { apiError, errorHandler };
