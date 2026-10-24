const { execFileSync } = require('node:child_process');

// Inspect Git path metadata only. Never open session files, secrets, exports, or logs.
function isPrivatePath(file) {
  const normalized = file.replaceAll('\\', '/');
  return /(^|\/)(?:\.wwebjs_auth|\.wwebjs_cache|node_modules|data|logs|private|exports|backups|screenshots)(\/|$)/i.test(normalized) ||
    /(^|\/)\.env(?:\.|$)/i.test(normalized) ||
    /\.(?:log|db|sqlite|sqlite3)(?:-|$)/i.test(normalized) ||
    /\.(?:zip|7z|tar|gz|har|pem|key|p12|pfx)$/i.test(normalized) ||
    /(^|\/)(?:credentials[^/]*\.json|cookies[^/]*\.json)$/i.test(normalized);
}
function checkPublication() {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const paths = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const count = paths.filter(isPrivatePath).length;
  if (count) {
    console.error('Publication check failed: ' + count + ' private/generated paths are tracked or unignored. Do not publish.');
    return 1;
  }
  console.log('Publication path check passed. Manually review source/staged content too; this is not a secret-content or history scanner.');
  return 0;
}
if (require.main === module) {
  try { process.exitCode = checkPublication(); }
  catch { console.error('Publication check could not inspect Git metadata.'); process.exitCode = 1; }
}
module.exports = { isPrivatePath };
