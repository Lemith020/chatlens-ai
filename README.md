# ChatLens AI

A local web app for reviewing selected WhatsApp group conversations. The Express backend and Vue dashboard support local Ollama analysis of displayed message snapshots. SQLite persistence and AI progress tracking remain planned.

## Verified progress

The user previously verified QR login, saved-session reuse, group listing, and fetching ten mixed records. This version adds bounded plain-text history search and multiple-group requests. Its offline tests pass; the changed integration still needs the manual live verification below. Offline tests do not establish unread preservation or complete history access.

## Structure

| File or folder | Responsibility |
| --- | --- |
| backend/index.js | Small entry point, shared client setup, process signal handlers. |
| backend/src/server.js | Loopback HTTP startup and idempotent shutdown; cleanup after startup/bind failure. |
| backend/src/app.js | Express wiring, routes, safe errors; 4 KB JSON limit except the bounded analysis snapshot route. |
| backend/src/config/index.js | Port, fixed 127.0.0.1 host, original session path and Chrome settings. |
| backend/src/features/whatsapp/whatsapp.client.js | One client shared through Node module caching. |
| backend/src/features/whatsapp/whatsapp.service.js | Connection status, QR display, bounded browser cleanup. |
| backend/src/features/whatsapp/whatsapp.routes.js | Status endpoint. |
| backend/src/features/groups | Metadata routes and stable group ID validation. |
| backend/src/features/messages/messages.routes.js | Single and multiple selection endpoints. |
| backend/src/features/messages/messages.service.js | Selection checks, serial processing, request lock, per-group failures. |
| backend/src/features/messages/messages.history.js | Bounded WhatsApp compatibility adapter; text filtering and history metadata. |
| backend/src/middleware | Local Host/Origin protection and safe error responses. |
| backend/test/api.test.js | Synthetic offline HTTP, browser-adapter, lifecycle, and protection tests. |
| backend/src/features/analysis | Analysis service, structured prompt/schema, and snapshot-only POST route. |
| backend/src/integrations/ollama.client.js | Bounded, loopback-only Ollama chat adapter using built-in fetch. |
| backend/src/database | Placeholder for planned storage. |
| frontend | Vue dashboard, message loading, snapshot analysis, and source-message views. |

## Setup and startup

Requires Node.js >=22.12.0 (tested here with v24.21.0), installed backend dependencies, and Google Chrome. Security maintenance updated the Puppeteer override from 25.6.0 to 25.16.0 and body-parser to 2.4.0 in the lock file. The resulting supported chromium-bidi dependency uses patched Zod 4.6.7. whatsapp-web.js remains 1.34.7; the Chrome channel/settings and session path are unchanged. The updated browser integration still needs your live verification.

From the **project root**:

~~~powershell
# Only if dependencies are not already installed:
npm.cmd --prefix backend ci --ignore-scripts
npm.cmd --prefix backend start
~~~

Alternatively, from **backend/**:

~~~powershell
npm.cmd start
~~~

Installation uses --ignore-scripts to skip dependency lifecycle hooks and browser downloads; this app uses your installed Chrome.

The API listens only at http://127.0.0.1:3001. Set $env:PORT before starting to choose a different port; update example URLs accordingly. The host cannot be overridden. Chrome remains visible, with the existing 300000 ms protocol timeout. The absolute session directory remains backend/.wwebjs_auth regardless of working directory.

If linking is needed, scan the terminal QR using WhatsApp > Linked devices. Only the scannable QR is rendered; the raw payload is not printed. Do not capture or share that terminal. Saved sessions are reused. Press Ctrl+C to stop. Cleanup calls destroy, never logout, and has a five-second deadline; if it fails, only this client's owned browser process is terminated. A late initialization completion triggers cleanup again. There are no automatic reconnect/retry loops. Fatal initialization failure closes HTTP too; terminal event states such as auth_failure/disconnected are available from status while HTTP remains running.

## API

No separate selection endpoint or stored selection is needed: pass IDs returned by the group list. Startup never automatically fetches groups or message bodies.

| Method and path | Response |
| --- | --- |
| GET /api/status | API health and WhatsApp status/ready. |
| GET /api/groups | Group metadata: id, name, unreadCount. No direct chats. |
| GET /api/groups/:groupId/messages | groupId, messages, history for one group. |
| POST /api/messages | JSON body with groupIds: 1 to 5 unique group IDs; returns results per group. |
| POST /api/analysis | JSON body with groups: 1 to 5 displayed group snapshots; per-group local analysis, errors, or explicit empty-group skips. |

Status example:

~~~json
{ "status": "ok", "whatsapp": { "status": "ready", "ready": true } }
~~~

WhatsApp states: idle, initializing, qr_required, authenticated (not yet ready), ready, auth_failure, disconnected, error, stopping, stopped. The API's status=ok means HTTP is responding; check whatsapp.ready before collecting messages. Stopping/stopped generally cannot be observed after HTTP closes.

Single-group response example, using dummy content:

~~~json
{
  "groupId": "123@g.us",
  "messages": [{
    "id": "dummy-message-1", "groupId": "123@g.us", "timestamp": 100,
    "type": "chat", "body": "Dummy meeting reminder", "fromMe": false
  }],
  "history": { "reason": "history_unavailable", "scanned": 3, "loads": 1 }
}
~~~

Timestamps are Unix seconds. Only type=chat with non-empty trimmed body is included. Media (including captions), stickers, system records, and blank bodies are excluded. Results are deduplicated by serialized message ID and returned oldest to newest within the recent selected text messages.

Multi-group request and partial response examples:

~~~json
{ "groupIds": ["123@g.us", "456@g.us"] }
~~~

~~~json
{
  "results": [
    { "groupId": "123@g.us", "messages": [], "history": { "reason": "history_unavailable", "scanned": 0, "loads": 1 } },
    { "groupId": "456@g.us", "error": { "code": "MESSAGE_FETCH_FAILED", "message": "Message history could not be fetched." } }
  ]
}
~~~

Multi-group HTTP status is 200 if all groups succeed, 207 if any selected group fails (including when all fail). Inspect each result.error. Malformed whole requests fail before any content is fetched. Valid but missing IDs produce per-group GROUP_NOT_FOUND in batch responses, or HTTP 404 for a single group. No content is fetched from unselected IDs.

Errors use { error: { code, message } }. Not ready: 503 for WhatsApp fetches. Invalid ID/selection or JSON: 400. Missing route/group: 404. Wrong POST content type or compressed request body: 415. Compressed bodies are disabled before decompression. Body over 4 KB (192 KB for analysis snapshots): 413. Message-fetch failure or timeout: 502. Overlapping message or analysis request: 429. Unexpected errors: generic 500. Analysis-specific per-group failures are described below. Raw library errors, stack traces, disconnect reasons, credentials, and message bodies are not logged or exposed through errors. Fetch failures are never silently converted to an empty success.

## History limits and compatibility

Each group returns up to ten recent plain-text messages. It searches beyond ten mixed records, subject to **500 unique records**, **five earlier-history load calls**, and a **30-second adapter deadline** per group. Group requests are processed sequentially; one message request may be active at a time. A five-group batch can therefore take approximately 150 seconds plus metadata/protocol overhead. The limits are fixed; there is no unlimited-history option.

history.reason is:

- requested_count: ten eligible text messages were found.
- scan_limit: the 500-record or five-load bound was reached.
- history_unavailable: no accessible chat model, an empty load, or a load that added no new IDs. Available text results are returned, possibly none.

The installed API provides no sufficiently reliable exhaustion signal in this adapter. Consequently this version **never claims history_exhausted**. Empty/no-progress loads do not prove that older messages do not exist. Load exceptions and timeouts are failures, even if some messages were already found. The timeout stops further adapter iterations; the already-issued browser operation cannot be cancelled by Promise.race. Chrome/protocol failures may still require restarting the backend.

Group metadata retains the WAWebCollections workaround. Message history retains the tested Chat ID construction and the same WWebJS.getChat(..., { getAsModel: false }) / WAWebChatLoadMessages calls used internally by the installed library. The adapter replaces the library's unbounded fetchMessages loop with explicit limits. These are internal WhatsApp interfaces and need live retesting after integration updates. No UI automation opens chats. App code never calls sendSeen, markUnread, sendMessage, or chat mutation methods.

Recent text messages are **not** WhatsApp unread messages. unreadCount is WhatsApp metadata, not an AI processing checkpoint. This backend does not save messages or track which messages have been analyzed. Unread preservation and full history availability remain unverified live behaviors.

## Offline checks

From the **project root** (no Chrome launch, WhatsApp login, session access, or real messages):

~~~powershell
npm.cmd --prefix backend test
node --check backend/index.js
Get-ChildItem backend/src,backend/test,backend/scripts -Recurse -File -Filter *.js | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { throw 'Syntax check failed' } }
~~~

From **backend/** instead:

~~~powershell
npm.cmd test
node --check index.js
Get-ChildItem src,test,scripts -Recurse -File -Filter *.js | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { throw 'Syntax check failed' } }
~~~

Tests execute the real adapter function against synthetic browser models and fake clients. They cover transitions, input limits, group filtering, history mixing/deduplication/order, fewer/empty results, count/scan/load/no-progress/time bounds, partial failures, concurrency, local protections, startup failures, and shutdown. They do not import the shared live-client module or call the real library's initialize method.

## Manual live verification in Windows PowerShell

Run these yourself only when ready. From the **project root**, terminal 1:

~~~powershell
npm.cmd --prefix backend start
~~~

Terminal 2 (any directory), after WhatsApp is ready:

~~~powershell
$base = 'http://127.0.0.1:3001'
Invoke-RestMethod "$base/api/status" -ErrorAction Stop
$groups = (Invoke-RestMethod "$base/api/groups" -ErrorAction Stop).groups
$groups | Format-Table id, name, unreadCount

# Dummy ID: replace with one from your group list, with no trailing spaces.
$groupId = '123@g.us'
$url = "$base/api/groups/" + [uri]::EscapeDataString($groupId.Trim()) + '/messages'
$result = Invoke-RestMethod $url -ErrorAction Stop
$result.history
$result.messages.Count
$result.messages | Select-Object id, timestamp, type
# Optional, view message bodies locally only:
# $result.messages | Format-Table timestamp, body -Wrap

# Dummy IDs: replace BOTH with available IDs from your list.
$body = @{ groupIds = @('123@g.us', '456@g.us') } | ConvertTo-Json -Compress
$batch = Invoke-RestMethod "$base/api/messages" -Method Post -ContentType 'application/json' -Body $body -ErrorAction Stop
$batch.results | ForEach-Object {
  [pscustomobject]@{ groupId = $_.groupId; count = $_.messages.Count; reason = $_.history.reason; error = $_.error.code }
}
~~~

Check that all returned types are chat, bodies are nonblank, IDs are unique, times ascend, and no group has more than ten messages. For a group with fewer messages, inspect history.reason; do not infer exhaustion. You can combine an available ID with fake 999@g.us to check a per-group 404, provided it is not actually in your list. Before readiness, group/message routes should return 503. Ctrl+C should release the API port and close only the owned Chrome process. Start again to check saved-session reuse. Compare unread status manually if needed; offline tests cannot guarantee WhatsApp's internal side effects.

## Safe startup diagnostics

Startup and cleanup failures emit one JSON line per failing step: step, name, code, and description. Steps distinguish HTTP startup/close, WhatsApp initialization, initialization cleanup, normal cleanup, and forced browser cleanup. Recognized error names/codes are allowlisted; unknown values become UnknownError/UNKNOWN. Descriptions are fixed categories, never copied raw messages. Paths, stack traces, session data, credentials, and arbitrary error properties are withheld.

For example, an occupied port produces a diagnostic with step=http.start and code=EADDRINUSE. This is an example, not a diagnosis of your machine. If initialization and cleanup both fail, the original initialization error remains the primary cause internally and each cleanup failure is reported separately. Startup or cleanup failure sets exit code 1.

Rerun from the project root:

~~~powershell
npm.cmd --prefix backend start
# After the process exits:
$LASTEXITCODE
~~~

The focused offline regression test is backend/test/diagnostics.test.js. It tests the actual entry point with an intercepted fake client, including simultaneous initialization/cleanup failure, non-zero exit, and private-data redaction. It never constructs the live client or reads a session.

## Publication and security checks

From the **project root**, before publishing:

~~~powershell
npm.cmd --prefix backend run check:publication
npm.cmd --prefix backend audit --ignore-scripts
# Review these locally; do not paste private content into chat:
git diff --cached --name-only
git diff --cached
~~~

From **backend/** use npm.cmd run check:publication and npm.cmd audit --ignore-scripts. The publication command checks Git path metadata (tracked and unignored candidate files) without opening session files or secrets. It fails for private/generated path categories, including already-tracked ignored paths. It is a manual pre-publication check, not an installed Git hook, a content-secret scanner, or a history scanner. A passing result does not make arbitrary source text or images safe to publish.

Session/cache, .env, databases/logs, private/exports/backups/screenshots folders, archive files, browser HAR captures, and common private-key files are ignored. The package.json files allowlist also limits npm packaging to application source/scripts and npm's mandatory metadata; it does not control GitHub contents. Do not upload a project ZIP containing ignored local sessions, and do not share rendered QR codes. QR display remains necessary for linking and is unchanged.

The 2026-10-24 security verification passed 28 offline tests and npm audit reported zero known vulnerabilities. This is a point-in-time advisory result, not a guarantee against unknown flaws. Installed module imports and synthetic browser-protocol validation passed without launching Chrome. Run your normal status/group/message workflow again after the browser dependency update. See SECURITY_REVIEW.md for scope and remaining limits. The user accepted the historical group-name disclosure; Git history was not rewritten.

## Local protection and privacy

Every response uses Cache-Control: no-store. Host must exactly match 127.0.0.1:<actual API port>. Browser Origin, when present, must exactly match http://127.0.0.1:<port>; null and foreign origins and cross-site Fetch Metadata requests are rejected. Wildcard CORS is not enabled. The Vue dev server proxies /api to port 3001 and translates only its exact local Origin (http://127.0.0.1:5173) to the backend Origin. Foreign/null origins and cross-site metadata retain backend rejection. Use that exact local UI URL; do not disable backend protections. These protections are not authentication against other local programs.

No static files are served. Keep backend/.wwebjs_auth/, .wwebjs_cache/, node_modules/, data/, logs/, .env secrets, chat exports, databases, private logs, real-message screenshots, and session files outside Git. Existing .gitignore covers generated sessions, caches, data, secrets, and logs. Source, tests, README, package manifests, and lock file are the project artifacts; this task does not stage, commit, or push anything.

WhatsApp still requires network access. Local operation is not offline WhatsApp. Local AI analysis uses the service described below. SQLite would not automatically encrypt stored data. ChatLens AI is independent of WhatsApp/Meta and uses an unofficial integration that can break and may carry account restriction risks.

## Local Ollama analysis service

The service does not import the WhatsApp client, read sessions, or store data. The API route passes validated snapshots to it without refetching messages or requiring WhatsApp readiness. It calls only `http://127.0.0.1:11434/api/chat`, using Node's built-in `fetch`, `stream: false`, `think: false`, and a JSON schema in `format`. Redirects are rejected. There are no retries, cloud providers, or fallbacks. Ollama must already be running with the chosen model installed.

The existing environment config pattern defaults `OLLAMA_MODEL` to `qwen3:4b`. Set it before loading the service, for example `$env:OLLAMA_MODEL = 'qwen3:4b'` in PowerShell. The URL cannot be configured. No dependency or lockfile changes are required.

Exported CommonJS interfaces:

~~~js
const createAnalysisService = require('./backend/src/features/analysis/analysis.service');
const analysis = createAnalysisService();
const result = await analysis.analyze([
  { id: 'dummy-1', body: 'Please send the draft tomorrow.' },
]);
// { summary: string,
//   importantUpdates: [{ text: string, messageIds: string[] }],
//   tasks: [{ text: string, messageIds: string[], deadlineText: string | null }] }
~~~

`createAnalysisService({ fetchImpl, model, timeoutMs })` supports injected fetch for offline tests. `analyze(messages)` accepts existing message records but sends only `id` and `body`. It validates 1–50 messages, unique nonblank IDs (at most 256 characters), nonblank bodies (at most 8,000 characters each), and at most 32,768 UTF-8 bytes of serialized projected input. `createAnalysisService.limits` exports these service limits.

`createOllamaClient(options).chat(validatedMessages)` is the lower-level adapter used by the service; callers should use `analyze` for input and result validation. The adapter bounds the entire response envelope to 65,536 bytes while reading, and the JSON content to 32,768 bytes. The default request timeout is 60,000 ms, covers fetch and body reading, and aborts the request; injected timeout values must be integers from 1 to 120,000 ms.

Results require exactly the documented fields. Summary is at most 4,000 characters; each findings array has at most 50 entries, with nonblank text of at most 2,000 characters and 1–50 unique references to supplied IDs. Every task requires `deadlineText`, either null or a nonblank phrase of at most 500 characters copied verbatim from a cited body. Relative phrases such as “tomorrow” stay as written. The system prompt treats all message bodies as untrusted conversation data and forbids obeying embedded instructions or inventing facts or dates. Schema/reference/deadline checks enforce structural constraints; generated summaries and task interpretations can still be inaccurate and need human review.

Failures reject with safe Error fields (`code`, `message`, `status`, `isApiError`): `INVALID_ANALYSIS_INPUT` (400), `OLLAMA_UNAVAILABLE` (503), `OLLAMA_TIMEOUT` (504), `OLLAMA_MODEL_MISSING` (503, Ollama HTTP 404), or `INVALID_MODEL_OUTPUT` (502). Invalid factory configuration throws a fixed configuration error. Prompts, bodies, responses, and raw upstream errors are never logged or persisted by this integration.

Focused offline tests from the project root:

~~~powershell
node --test backend/test/analysis.test.js
~~~

Run all offline backend regressions with `npm.cmd --prefix backend test`. These tests use fake messages and mocked Ollama fetch; they do not contact Ollama or run live WhatsApp.

## Displayed-snapshot analysis API and dashboard

`POST /api/analysis` accepts only `{ groups: [...] }`. Each group has exactly `groupId`, `messages`, and `history`:

~~~json
{
  "groups": [{
    "groupId": "123@g.us",
    "messages": [{ "id": "dummy-1", "groupId": "123@g.us", "timestamp": 100, "type": "chat", "body": "Send the draft tomorrow.", "fromMe": false }],
    "history": { "reason": "history_unavailable", "scanned": 1, "loads": 1 }
  }]
}
~~~

All groups are validated before any analysis starts. Supply 1–5 unique WhatsApp group IDs (at most 80 characters), each with 0–50 unique messages and the service's per-group text/ID/input-byte limits above. Every message must have exactly the six fields shown: its groupId must match, timestamp must be a nonnegative safe integer in Unix seconds, type must be chat, and fromMe must be boolean. History requires an existing reason (`requested_count`, `scan_limit`, or `history_unavailable`), scanned (integer 0–500 and at least the message count), and loads (integer 0–5); optional operation/code diagnostic strings are preserved and limited to 100 characters. Snapshot history is caller-supplied context, not independently verified completeness. No group names or extra message fields are accepted.

The complete JSON body is limited to 192 KB; all other existing routes retain their 4 KB limit. Compressed bodies remain disabled. Empty requests and requests with only empty groups are rejected with 400. In mixed requests, empty groups return `skipped: "empty_group"` without calling Ollama. A single app-wide analysis request runs at a time (429 `ANALYSIS_BUSY` for overlaps), groups run sequentially, and the lock releases after success or failure. Five groups may take about five minutes at the existing 60-second per-group deadline. A client cancellation does not imply that server-side analysis has finished; retry may receive 429 until the lock releases.

The response is `{ results: [...] }`, with each entry containing `groupId`, unchanged `history`, and `scope: "retrieved_messages_only"`, plus one of `analysis: { summary, importantUpdates, tasks }`, `error: { code, message }`, or `skipped`. HTTP 200 means no group failed; 207 means at least one failed. Known Ollama error codes are preserved with fixed safe messages; unexpected per-group failures use `ANALYSIS_FAILED`. Nothing is persisted or logged. Analysis never fetches WhatsApp history or changes read status.

The Analyze messages button sends only displayed successful group snapshots, including successful empty groups for explicit skipping. Failed message loads remain visible in the messages panel and are excluded. It is enabled only with some displayed messages and while neither loading nor analysis is active. Changing selection, starting a load, or changing the displayed snapshot clears insights and invalidates pending responses; stale message-load responses are also ignored. Results show per-group errors, concise summaries, updates, tasks, and stated deadlines, with expandable source-message text. All content is rendered as text. Partial/unavailable history is labeled, and every analysis is scoped to retrieved messages rather than complete history. No messages or results are stored in localStorage.

Offline UI and API verification from the project root:

~~~powershell
npm.cmd --prefix backend test
node --test frontend/test/*.test.cjs
npm.cmd --prefix frontend run build
~~~

Tests mock analysis/fetch and use synthetic messages. They check validation, isolation, locking, request budgets, protections, loading/errors, history labels, escaping/source views, and stale responses. They do not establish model quality or verify a live browser/service workflow.

Manual steps for the user when ready (not run as part of this change):

1. Start your existing local Ollama with the configured model available, then start the backend normally. Start Vue with `npm.cmd --prefix frontend run dev` and open `http://127.0.0.1:5173` (the dev proxy targets backend port 3001).
2. Select groups and load messages. Analyze should be disabled during loading and for empty results. Press Analyze messages; verify loading and per-group summaries, updates, tasks, deadlines, and expandable sources. Review findings against source text.
3. Check that scan-limit/unavailable history shows retrieved-message-only scope and partial-history labels. A successful empty group alongside populated groups should show an explicit skip.
4. Change selection or load messages while analysis is pending. Insights should clear and old results should not return. Load and analyze the new snapshot after the active request settles.
5. Stop Ollama and analyze a displayed snapshot to check safe errors; restart it to retry. Compare WhatsApp read status manually if desired. Analysis itself makes no WhatsApp calls; offline checks cannot establish the live library's read-status behavior.
