// Never print error.message, stack, paths, or arbitrary library properties.
const names = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'TimeoutError', 'ProtocolError', 'TargetCloseError', 'SystemError']);
const descriptions = {
  EADDRINUSE: 'The local API port is already in use.',
  EACCES: 'Access was denied while starting or cleaning up a local resource.',
  EPERM: 'The operating system denied a local resource operation.',
  ENOENT: 'A required executable or local resource could not be found.',
  EBUSY: 'A local resource is busy or locked.',
  ECONNREFUSED: 'A required local connection was refused.',
  ETIMEDOUT: 'A startup or cleanup operation timed out.',
  SHUTDOWN_TIMEOUT: 'The browser did not close before the cleanup deadline.',
};
function safeDetails(error) {
  // Follow only Error causes, to retain the original failure behind safe wrappers.
  let cause = error;
  for (let depth = 0; depth < 5 && cause?.cause instanceof Error; depth++) cause = cause.cause;
  const name = names.has(cause?.name) ? cause.name : 'UnknownError';
  const code = Object.hasOwn(descriptions, cause?.code) ? cause.code : 'UNKNOWN';
  let description = descriptions[code];
  if (!description) {
    const message = typeof cause?.message === 'string' ? cause.message : '';
    // Match known failure categories; never copy any matched text into output.
    if (/user data directory is already in use|profile.*(?:in use|lock)|singletonlock|browser is already running/i.test(message)) {
      description = 'The browser profile appears to be locked or already in use.';
    } else if (/could not find (?:google )?chrome|could not find.*browser|browser was not found|executable.*(?:not found|does not exist)|channel.*chrome/i.test(message)) {
      description = 'The configured Chrome executable could not be located.';
    } else if (/failed to launch|failed to start.*browser/i.test(message)) {
      description = 'The browser could not be launched.';
    } else if (name === 'TimeoutError' || /timed? ?out|timeout/i.test(message)) {
      description = 'A startup or cleanup operation timed out.';
    } else if (name === 'TargetCloseError' || /target closed|browser.*disconnected/i.test(message)) {
      description = 'The browser or page closed during the operation.';
    } else if (name === 'ProtocolError') {
      description = 'A browser protocol operation failed.';
    } else {
      description = 'Unclassified failure; private error details were withheld.';
    }
  }
  return { name, code, description };
}
function createFailureReporter({ processState = process, write = (line) => console.error(line) } = {}) {
  const steps = new Set(['backend.setup', 'whatsapp.setup', 'http.start', 'whatsapp.start', 'http.close', 'whatsapp.stop', 'whatsapp.start.cleanup', 'browser.force_close']);
  return (step, error) => {
    processState.exitCode = 1;
    write(JSON.stringify({ step: steps.has(step) ? step : 'backend.setup', ...safeDetails(error) }));
  };
}
module.exports = { safeDetails, createFailureReporter };
