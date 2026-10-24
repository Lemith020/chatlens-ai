const reportFailure = require('./src/diagnostics').createFailureReporter();
let step = 'whatsapp.setup';
try {
  const client = require('./src/features/whatsapp/whatsapp.client');
  const whatsapp = require('./src/features/whatsapp/whatsapp.service')(client);
  step = 'backend.setup';
  const app = require('./src/app')({ client, whatsapp });
  step = 'http.start';
  const { shutdown } = require('./src/server')(app, whatsapp, reportFailure);
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  reportFailure(step, error);
}
