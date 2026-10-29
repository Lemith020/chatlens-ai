// Self-contained so the exact same normalizer can run in Node tests and the
// browser history adapter. These keys are internal identities, not WhatsApp IDs.
module.exports = function normalizeMessageId(value) {
  const nonempty = (part) => typeof part === 'string' && part.trim().length > 0;
  const address = (part) => nonempty(part) ? part :
    part && typeof part === 'object' && !Array.isArray(part) && nonempty(part._serialized) ? part._serialized : null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid message identity');
  const serialized = nonempty(value._serialized) ? value._serialized : null;
  const remote = address(value.remote);
  const participant = value.participant == null ? null : address(value.participant);
  const componentsValid = remote !== null && typeof value.fromMe === 'boolean' && nonempty(value.id) &&
    (value.participant == null || participant !== null);
  const componentKey = componentsValid ? JSON.stringify([
    'chatlens:message-id:v1', 'components', remote, value.fromMe, value.id, participant,
  ]) : null;
  if (!serialized && !componentKey) throw new TypeError('Invalid message identity');
  const key = serialized ? JSON.stringify(['chatlens:message-id:v1', 'serialized', serialized]) : componentKey;
  return { key, responseId: serialized || componentKey,
    aliases: componentKey && componentKey !== key ? [key, componentKey] : [key] };
};
