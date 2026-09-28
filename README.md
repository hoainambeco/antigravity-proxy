# Antigravity Proxy (Standalone)

High-performance, standalone multi-protocol LLM Proxy Gateway extracted from AntigravityManager. Built with **NestJS + Fastify**.

Seamlessly proxies OpenAI, Anthropic, and Gemini API requests to Google Cloud Code / Antigravity upstream with multi-account round-robin scheduling, automatic token refresh, quota tracking, and thought signature recovery for thinking models.

---

## Features

- **Multi-Protocol Translation**:
  - OpenAI Compatible: `/v1/chat/completions`, `/v1/models`, `/v1/responses` (WebSockets), `/v1/images/generations`
  - Anthropic Compatible: `/v1/messages`
  - Gemini Compatible: `/v1beta/models/...`
- **Multi-Account Pooling & Rotation (`accounts.json`)**:
  - Round-robin / sticky session / cache-first candidate selection.
  - Automatic OAuth token refresh (`ya29...` access token from `refresh_token`).
  - Automatic 429 rate-limit cooldown and failover across accounts.
- **Thought Signature Recovery**:
  - In-memory preservation of reasoning turns and thought signatures for Gemini 2.0 Thinking & Claude models.
- **Dynamic API Key Management (TypeORM + SQLite)**:
  - Create, revoke, enable/disable multiple API keys (`sk-ag-...`) for different clients/users.
  - Sub-millisecond in-memory cache validation with async last-used tracking.
  - TypeORM schema migrations with zero `synchronize: true` risk.
- **Ultra-lightweight & Headless**:
  - Pure Node.js & TypeScript built on NestJS & Fastify.
  - Deployable on Linux VPS, macOS, Windows, or Docker containers.

---

## Quick Start

### 1. Installation

```bash
cd antigravity-proxy
npm install
```

### 2. Configure Accounts

You can add multiple Google Cloud accounts using either the CLI wizard or manual JSON editing.

#### Method A: Interactive CLI Login (Recommended)
Simply run:
```bash
npm run add-account
```
- A Google OAuth login link will be opened in your browser (or printed in the terminal).
- Sign in with your Google Account and grant permissions.
- The CLI will automatically receive the OAuth tokens, retrieve your email and Google Cloud Project ID, and append the account to `accounts.json`.
- Repeat `npm run add-account` to add as many accounts as you want!

#### Method B: Manual Configuration
Alternatively, copy `accounts.json.example` to `accounts.json`:
```bash
cp accounts.json.example accounts.json
```
And add your accounts:
```json
[
  {
    "id": "account-1",
    "email": "user1@gmail.com",
    "token": {
      "refresh_token": "1//04_YOUR_GOOGLE_REFRESH_TOKEN",
      "access_token": "ya29.YOUR_ACCESS_TOKEN",
      "project_id": "your-gcp-project-id"
    },
    "health": {}
  }
]
```

### 3. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Key variables:
- `ANTIGRAVITY_OAUTH_CLIENT_ID` / `ANTIGRAVITY_OAUTH_CLIENT_SECRET`: **Required.** See [OAuth Client Credentials](#oauth-client-credentials) below.
- `PORT`: Port to listen on (default `8045`).
- `PROXY_API_KEY`: (Optional) Master secret key with full admin and proxy access. If omitted, the server uses dynamic API keys in SQLite.
- `SQLITE_DB_PATH`: Path to SQLite database file (default `./data/antigravity.sqlite`).
- `ACCOUNTS_FILE`: Path to `accounts.json` (default `./accounts.json`).

### 4. API Key Management (CLI & Migrations)

Manage dynamic API keys for Cursor, Claude Code, and other clients via CLI:

```bash
# List all API keys
npm run api-key list

# Create a new API key (auto-generates sk-ag-...)
npm run api-key create "Cursor - Work"

# Create an Admin key
npm run api-key create "Admin Dashboard" -- --role admin

# Toggle active/inactive state
npm run api-key toggle "Cursor - Work"

# Delete an API key
npm run api-key delete "Cursor - Work"
```

#### TypeORM Migrations

The database runs with `synchronize: false` for production safety. Migrations run automatically on startup (`migrationsRun: true`), and can also be managed manually:

```bash
# Auto-generate migration by comparing Entities against the SQLite schema
npm run migration:generate -- src/modules/database/migrations/<MigrationName>

# Run pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Create empty migration template
npm run migration:create -- src/modules/database/migrations/<MigrationName>
```

### 5. Run Server (Standard NestJS CLI)

**Development Mode (live reload / watch):**
```bash
npm run start:dev
```

**Production Build & Run:**
```bash
npm run build
npm run start:prod
```

---

## OAuth Client Credentials

This repository ships **no** OAuth client credentials. You must supply your own:

```bash
ANTIGRAVITY_OAUTH_CLIENT_ID=<client id>
ANTIGRAVITY_OAUTH_CLIENT_SECRET=<client secret>
```

Both are required. With either missing, the proxy logs a warning at startup and every
OAuth operation (`getAuthUrl`, code exchange, token refresh) fails with
`No OAuth client configured.`

### Why they are not bundled

The proxy calls `cloudcode-pa.googleapis.com/v1internal` and requests Google-internal
OAuth scopes (`auth/aicode`, `auth/cclog`, `auth/experimentsandconfigs`). Google grants
those only to its own first-party clients, so an OAuth client you create in your own GCP
project cannot request them — the only credentials that work belong to the Antigravity
desktop application.

Committing such a pair to a public repository would get it flagged by secret scanners
and revoked, breaking the proxy for everyone using it, so it is kept out of the source
tree and out of the published build.

### Obtaining a credential pair

Extract the client id and secret from the Antigravity installation on your own machine;
they are present in the application bundle. Whether your use of them complies with
Google's Terms of Service is your responsibility.

### Rotating

Because the pair is read from the environment, a revoked credential is replaced by
editing `.env` and restarting — no rebuild required.

### Using more than one client

`ANTIGRAVITY_OAUTH_CLIENTS` registers additional clients as
`key|client_id|client_secret[|label]` entries separated by `;`. Reusing the key
`antigravity_enterprise` overrides the credentials above. `ANTIGRAVITY_OAUTH_CLIENT_KEY`
selects which key is active at startup; the others are used as fallbacks when a token
exchange or refresh fails.

---

## Running with Docker

Build and run:

```bash
docker build -t antigravity-proxy .

# Run mounting accounts.json and SQLite data volume
docker run -d \
  --name antigravity-proxy \
  -p 8045:8045 \
  -v $(pwd)/accounts.json:/app/data/accounts.json \
  -v $(pwd)/data:/app/data \
  -e PORT=8045 \
  antigravity-proxy
```

> **Note:** TypeORM migrations execute automatically on container startup (`migrationsRun: true`).
> To manually trigger production migrations inside a running container:
> ```bash
> docker exec -it antigravity-proxy npm run migration:run:prod
> ```

---

## Client Configuration Examples

Generate a unique API key for each client first (or use `PROXY_API_KEY` from `.env`):
```bash
npm run api-key create "My Client"
# Returns: sk-ag-xxxxxxxxxxxxxxxxxxxxxxxx
```

---

### Cursor IDE
1. Open **Cursor Settings** (`Ctrl + Shift + J` or `Cmd + Shift + J`) -> **Models**.
2. Add desired models:
   - `claude-3-7-sonnet` (or `claude-3-7-sonnet-thought`)
   - `claude-3-5-sonnet-20241022`
   - `gemini-2.5-pro`
   - `gemini-2.0-flash-exp`
3. Scroll down to **OpenAI API Key**:
   - Turn ON **Override OpenAI Base URL**.
   - **Base URL:** `http://localhost:8045/v1`
   - **API Key:** Enter your generated key (`sk-ag-...`) or `PROXY_API_KEY`.
4. Click **Verify** to test connection.

---

### OpenCode CLI
Configure in `opencode.json` (in your workspace or `~/.config/opencode/opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "antigravity": {
      "npm": "@ai-sdk/openai",
      "options": {
        "baseURL": "http://localhost:8045/v1",
        "apiKey": "sk-ag-YOUR_API_KEY"
      },
      "models": {
        "claude-3-7-sonnet": { "name": "Claude 3.7 Sonnet" },
        "gemini-2.5-pro": { "name": "Gemini 2.5 Pro" }
      }
    }
  }
}
```

Or via environment variables:
```bash
export OPENAI_BASE_URL="http://localhost:8045/v1"
export OPENAI_API_KEY="sk-ag-YOUR_API_KEY"
opencode --model openai/claude-3-7-sonnet
```

---

### Claude Code CLI (Official Anthropic CLI)
```bash
export ANTHROPIC_BASE_URL="http://localhost:8045"
export ANTHROPIC_API_KEY="sk-ag-YOUR_API_KEY"
claude
```

---

### OpenAI Codex / OpenAI SDK
Connect any OpenAI SDK client directly to the proxy:

#### TypeScript / Node.js
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:8045/v1',
  apiKey: 'sk-ag-YOUR_API_KEY',
});

const res = await openai.chat.completions.create({
  model: 'claude-3-7-sonnet',
  messages: [{ role: 'user', content: 'Hello!' }],
});
console.log(res.choices[0].message.content);
```

#### Python
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8045/v1",
    api_key="sk-ag-YOUR_API_KEY",
)

res = client.chat.completions.create(
    model="claude-3-7-sonnet",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(res.choices[0].message.content)
```

---

### Cline / Roo Code (VS Code Extension)
In Settings -> **API Provider**:
- **OpenAI Compatible:**
  - **Base URL:** `http://localhost:8045/v1`
  - **API Key:** `sk-ag-YOUR_API_KEY`
  - **Model ID:** `claude-3-7-sonnet` or `gemini-2.5-pro`
- **Anthropic:**
  - **Base URL:** `http://localhost:8045`
  - **API Key:** `sk-ag-YOUR_API_KEY`
  - **Model ID:** `claude-3-7-sonnet`

---

### Aider
```bash
aider --openai-api-base http://localhost:8045/v1 \
      --openai-api-key sk-ag-YOUR_API_KEY \
      --model openai/claude-3-7-sonnet
```
