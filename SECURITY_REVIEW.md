# ChatLens AI publication review

Review date: 2026-10-24. This is a scoped source/publication review, not a security certification.

## Decision

No embedded WhatsApp session, login credential, private-message sample, or exfiltration endpoint was identified in the reviewed current application source. Publishing source alone does not transfer this computer's linked session. Do not describe this repository as fully secure. The user accepted disclosure of the historical group name, so history was left unchanged. The dependency findings below have now been addressed; the final npm audit reports zero known vulnerabilities.

## Scope and evidence

- Reviewed all 26 current non-private project files: README, .gitignore, backend entry point, source modules, tests, package manifest, and lock file. Empty storage/analysis/integration placeholders contain no implementation.
- Examined file paths across 29 commits reachable from local Git refs. No session/cache, .env, node_modules, data/log directories, or database/log file paths matched the private-path checks. Private file contents were not opened, including through Git.
- Checked the allowed historical source files for credential patterns, long WhatsApp IDs, meeting/invite URLs, and hardcoded group names. Found hardcoded group-name assignments in backend/index.js versions associated with commits 333ee41c, 665ef4f7, and ef5962cc. Values are deliberately omitted here. These are privacy metadata, not login credentials.
- Current source pattern checks found no matching credentials, long real WhatsApp IDs, or meeting/invite links. Pattern checks do not establish the absence of every possible secret or sensitive text.
- All 194 non-root dependency lock entries use registry.npmjs.org HTTPS URLs and have integrity hashes. Registry origin and integrity are not proof of safe dependency behavior. Third-party package source was not exhaustively audited.
- Confirmed .gitignore rules cover dummy session/cache paths, .env, database/data, logs, and node_modules without opening those directories.
- After the security fixes, all 28 offline tests passed, including local Host/Origin rejection, no static-file routes, safe error diagnostics, and fake-client startup/shutdown. All backend JavaScript syntax checks passed. No live WhatsApp connection was run.

## Dependency findings and remediation

The initial npm audit --json --ignore-scripts reported six high-severity affected packages, zero critical, from two underlying advisories:

- body-parser: compressed-request denial of service, GHSA-27r3-jxmh-p828: https://github.com/advisories/GHSA-27r3-jxmh-p828
- zod: oversized-collection memory exhaustion, GHSA-mrhx-c7xc-m3w5: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- chromium-bidi, puppeteer-core, puppeteer, and whatsapp-web.js are additionally flagged through the transitive zod dependency chain. Six package warnings do not mean six independent vulnerabilities.

These findings were not evidence of WhatsApp account compromise. Runtime exploitability was not established. Targeted fixes are now applied:

- Updated body-parser from 2.3.0 to 2.4.0 through Express's compatible declared version range.
- Disabled compressed JSON parsing (inflate: false) and added a sanitized 415 response. Tests submit valid gzip and gzip with trailing bytes, then confirm the server still responds to normal requests.
- Updated the existing Puppeteer override from 25.6.0 to 25.16.0. Its supported chromium-bidi 157.0.8090-0 dependency uses Zod 4.6.7. The old chromium-bidi parser relied on Zod v3's error.errors API, so forcing Zod v4 into the old dependency was avoided.
- Kept whatsapp-web.js 1.34.7, Chrome settings, and the original backend/.wwebjs_auth path. Imports and synthetic protocol validation passed offline; live WhatsApp compatibility must be checked by the user.
- Refreshed package-lock.json with dependency lifecycle scripts disabled. No Chrome/browser download or WhatsApp initialization was performed. Node >=22.12.0 is declared to match Puppeteer's requirement.
- Final online npm audit --json --ignore-scripts: zero known vulnerabilities across all severities. This is a point-in-time registry advisory check, not proof of complete security.

No audit fix --force or unsupported major Zod override was used.

## Existing protections and remaining boundaries

The API binds to 127.0.0.1 only, enforces exact local Host/Origin, does not enable CORS, uses no-store responses, and serves no static source/session files. The app has no remote-control endpoint or message-sending route. Only selected group messages are fetched. Application-owned code contains no identified third-party chat-upload endpoint.

The API is not authenticated against other local programs. Malware, another user with filesystem access, or a tunnel/reverse proxy can bypass the intended local boundary. Never expose this API through public hosting, port forwarding, or a tunnel. WhatsApp and its library/browser still make their normal network connections; this review did not monitor them or certify their behavior.

Do not share the rendered login QR, backend/.wwebjs_auth, cache/browser profiles, .env, real chat exports, private logs, screenshots, backups, or archives of the project containing private data. .gitignore does not protect files already committed and cannot detect secrets pasted into source, README, images, or arbitrary archive names.

## Before publication

1. Historical group-name disclosure is accepted by the user. No Git history was rewritten. Group names alone do not confer login access; sessions and QR codes remain sensitive.
2. Dependency advisories were addressed with the targeted updates above. The user must rerun live status/group/message and saved-session tests after the browser dependency update.
3. Check the exact staged diff and file list before committing. Keep sessions, caches, secrets, exports, screenshots, private logs, and databases outside the published artifacts.
4. Remember Git commit author names/emails are also published with history. Existing GitHub remote contents, other clones, deleted/unreachable history, Git LFS, releases, Actions artifacts, and repository access settings were not verified.
5. If a session/QR was ever shared elsewhere, revoke the affected linked device from the phone. No exposed session was identified in this local review.

No staging, commit, push, deployment, session access/modification, or session deletion was performed. Dependency updates were authorized and are described above. npm audit queried dependency metadata only; no WhatsApp data was uploaded. This review file intentionally includes no real group name, chat content, or login values.

## Publication protections added

.gitignore now also excludes private/exports/backups/screenshots folders, common archives, HAR captures, private-key formats, and credentials JSON filenames. Existing session/cache/.env/database/log ignores remain intact. The package manifest limits npm packaging through a files allowlist; this does not control Git publication.

Run npm.cmd --prefix backend run check:publication from the project root before committing. The script examines Git tracked/unignored file path metadata only and rejects private/generated path categories without reading file contents. It is a manually invoked guard, not an automatic commit/push hook; its tests use dummy paths. Current repository path check and dummy ignore-rule checks pass. Review staged content manually too, because a source-code string, image, renamed session, or unusual archive can still contain secrets. Never share the terminal QR or a ZIP of the private working directory.
