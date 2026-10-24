# ChatLens AI

ChatLens AI is a local web app for reviewing WhatsApp group conversations. Its goal is to help users find important messages, read short summaries, and identify tasks and deadlines.

The web dashboard, backend, database, and AI processing are intended to run on the user's computer. A phone is used to link WhatsApp by scanning a QR code.

## Project Status

The prototype can connect to WhatsApp, select a group, and fetch recent messages. The project is being moved from one large `index.js` file into smaller modules.

The React dashboard, SQLite storage, and local AI analysis are planned features. Creating their folders does not mean these features are complete.

## Technology Stack

| Technology | Purpose |
| --- | --- |
| JavaScript | Main programming language |
| Node.js | Runs the backend |
| Express | Provides the local HTTP API |
| whatsapp-web.js | Connects to WhatsApp through a linked web session |
| Puppeteer and Chrome | Run and control the WhatsApp Web browser |
| qrcode-terminal | Displays a login QR code in the terminal |
| React | Planned browser dashboard |
| SQLite | Planned local data storage |
| Ollama and a local LLM | Planned message analysis |

## Folder Structure

This tree follows the supplied project screenshot. Collapsed folders are shown without guessing their internal filenames.

```text
chatlens-ai/
├── backend/
│   ├── .wwebjs_auth/          # Private local WhatsApp session
│   ├── .wwebjs_cache/         # Generated WhatsApp Web cache
│   ├── node_modules/         # Installed backend packages
│   ├── src/
│   │   ├── config/
│   │   │   └── index.js
│   │   ├── database/
│   │   │   ├── migrations/
│   │   │   └── connection.js
│   │   ├── features/
│   │   │   ├── analysis/
│   │   │   ├── groups/
│   │   │   ├── messages/
│   │   │   └── whatsapp/
│   │   ├── integrations/
│   │   │   └── ollama.client.js
│   │   ├── middleware/
│   │   │   └── error-handler.js
│   │   └── app.js
│   ├── index.js
│   ├── package-lock.json
│   └── package.json
├── frontend/
├── .gitignore
└── README.md
```

## What Each Folder Does

The responsibilities below describe the intended structure. Some modules may still be empty or under development.

| Folder | Responsibility |
| --- | --- |
| `chatlens-ai/` | Root folder for the full web app. |
| `backend/` | Contains the Node.js server, WhatsApp connection, API, and backend dependencies. |
| `backend/.wwebjs_auth/` | Stores sensitive linked-device session data. It allows the app to reuse an approved login. Keep it local and out of Git. |
| `backend/.wwebjs_cache/` | Stores generated WhatsApp Web cache files. Keep it out of Git. |
| `backend/node_modules/` | Contains packages installed by npm. Do not edit or commit this folder. |
| `backend/src/` | Contains the backend application modules. |
| `backend/src/config/` | Keeps settings such as the host, port, and local file paths in one place. |
| `backend/src/database/` | Contains database connection and schema setup code. |
| `backend/src/database/migrations/` | Contains ordered changes to the database schema, such as creating or changing tables. Commit schema code, not private database files. |
| `backend/src/features/` | Groups code by feature so related logic stays together. |
| `backend/src/features/whatsapp/` | Owns WhatsApp client setup, connection events, and connection status. |
| `backend/src/features/groups/` | Lists available groups and validates the user's group selections. |
| `backend/src/features/messages/` | Fetches messages for selected groups and prepares a consistent message format. |
| `backend/src/features/analysis/` | Holds analysis instructions and logic for categories, summaries, tasks, and deadlines. |
| `backend/src/integrations/` | Contains adapters for services used by the app. |
| `backend/src/middleware/` | Contains shared HTTP request and error handling. |
| `frontend/` | Contains the browser dashboard. It will call the backend API to display groups, messages, and reports. |

## What Each Visible File Does

| File | Responsibility |
| --- | --- |
| `backend/index.js` | Backend entry point. After refactoring, it should start the HTTP server and WhatsApp connection, and coordinate shutdown. The prototype currently contains additional logic that is being moved into modules. |
| `backend/src/app.js` | Creates the Express app and connects routes and middleware. Keep server startup separate from app setup. |
| `backend/src/config/index.js` | Exports shared configuration. Use stable paths so moving source files does not change the saved WhatsApp session location. |
| `backend/src/database/connection.js` | Opens and provides the local SQLite database connection when storage is implemented. |
| `backend/src/integrations/ollama.client.js` | Sends analysis requests to the local Ollama service and returns its responses. It should use a local model for the local-processing design. |
| `backend/src/middleware/error-handler.js` | Sends consistent API error responses without exposing private messages, credentials, or internal stack traces to the frontend. |
| `backend/package.json` | Defines backend dependencies, npm scripts, and dependency overrides. |
| `backend/package-lock.json` | Records the dependency versions resolved by npm for repeatable installation. Commit it with dependency changes. |
| `.gitignore` | Tells Git which untracked generated or private files to ignore. It does not remove files already tracked or committed. |
| `README.md` | Explains the project, setup, structure, progress, and privacy rules. |

The screenshot does not show files inside the feature folders or `frontend/`. Add their exact names and responsibilities here as those files are implemented.

## How the App Will Work

1. The user starts the local backend and opens the web dashboard.
2. The user links WhatsApp with a QR code when required.
3. The dashboard requests the available groups from the backend.
4. The user selects one or more groups.
5. The backend validates the selection and fetches the requested messages.
6. A local LLM analyzes the text through Ollama.
7. The dashboard displays important messages, summaries, tasks, and references to the original messages.

WhatsApp login approval applies to the linked session. Restricting processing to selected groups is the responsibility of the application code.

## Clean Code Rules

- Keep startup code in `backend/index.js` small.
- Keep HTTP routes focused on input validation, calling services, and sending responses.
- Keep feature logic in the relevant feature folder.
- Keep WhatsApp library workarounds inside backend integration or feature code.
- Keep AI requests separate from message collection.
- Use one shared WhatsApp client instead of creating a client for each API request.
- Return a consistent message format to the frontend instead of exposing library objects.
- Handle errors explicitly. Do not silently treat a failed fetch as an empty conversation.
- Avoid logging message text or session details.
- Check connection, group selection, and message fetching after changing integration code.

This structure reduces coupling, but changes still need appropriate verification.

## Backend Setup

Install Node.js and Git. The current browser configuration also uses an installed Google Chrome.

From the project root:

```powershell
cd backend
npm install
node index.js
```

When a QR code appears, open WhatsApp on the phone and use **Linked devices > Link a device** to scan it. Do not share the QR code or session files.

Keep this terminal open while the backend is running. Press `Ctrl + C` to stop it. Stopping the process does not revoke the linked-device login. To revoke access, log out the device from WhatsApp's **Linked devices** screen.

Frontend and Ollama startup instructions will be added when those features are implemented.

## Current Integration Notes

- The working prototype uses `whatsapp-web.js` version `1.34.7` with a Puppeteer override to `25.6.0`.
- Keep the working dependency configuration and lock file during refactoring.
- Basic group lookup currently uses an internal WhatsApp collection as a compatibility workaround.
- The tested message-fetch workaround creates a `Chat` instance from the selected group ID before calling `fetchMessages()`.
- These workarounds depend on library and WhatsApp Web behavior. Test them again after dependency updates.
- Fetching ten recent messages does not mean fetching ten unread messages.
- Image and video message text may be captions. Reading the media itself needs additional processing.
- The prototype does not prove that all past messages or all unread messages are available.

## Local Privacy

- Bind the HTTP server to `127.0.0.1` for local access.
- Keep session files, chat exports, databases, logs, secrets, and real-chat screenshots out of Git.
- Do not expose session or cache folders through Express static routes.
- Store private database files in an ignored location such as `backend/data/` when storage is added.
- Use a local Ollama model if messages must stay on the computer for AI analysis. Cloud models or APIs would change that design.
- WhatsApp still needs a network connection. Local AI processing does not make WhatsApp offline.
- SQLite files are not automatically encrypted.
- A private GitHub repository is not a place to store login sessions or chat data.
- Local processing reduces exposure but does not remove risks such as malware or unauthorized access to the computer.

## Git Tracking

Commit source code, documentation, `.gitignore`, `package.json`, `package-lock.json`, and database migrations.

Do not commit generated sessions, caches, installed packages, private messages, or database contents. A group name written directly in source code is also visible to anyone who can read the repository. Prefer user selection or local configuration.

## Next Milestones

- [ ] Move the working prototype into the feature structure.
- [ ] Verify local status, group, and message API routes.
- [ ] Build the React dashboard with group selection.
- [ ] Add SQLite storage and duplicate-message handling.
- [ ] Add Ollama analysis and validate Sinhala, Singlish, and English results.
- [ ] Separate WhatsApp unread state from the app's last-analyzed position.
- [ ] Add disconnect and delete-data controls.

## Disclaimer

ChatLens AI is an independent learning project. It is not affiliated with WhatsApp or Meta. It uses an unofficial WhatsApp integration, which can break when WhatsApp changes and may carry account restriction risks.Lemith Nanditha

