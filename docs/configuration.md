# Configuration

The server reads these environment variables. Empty values count as unset.

| Variable | Default | Docker (`docker-compose.yml`, Dockerfile) |
| --- | --- | --- |
| `PORT` | `3100` | `3100` |
| `DATA_DIR` | `<OS temp dir>/atlas-data` | `/data` (volume `data`, project `atlas`) |
| `VAULTS_PATH` | `/vaults` | `/vaults` (bind mount of `VAULTS_HOST_PATH`) |
| `ADMIN_EMAIL` | required | from `.env`, required |
| `APP_ORIGINS` | required | from `.env`, required |
| `SESSION_DAYS` | `30` | from `.env`, default `30` |
| `DEFAULT_NOTE_FOLDER` | `Mnemosyne` | from `.env`, default `Mnemosyne` |
| `ANTHROPIC_API_KEY` | one of this or the four federation IDs | from `.env` locally; **absent on the VM** (federation) |
| `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID`, `ANTHROPIC_WORKSPACE_ID` | unset | from `/etc/atlas/atlas.env` on the VM, each required there; never set locally |
| `ANTHROPIC_IDENTITY_TOKEN_FILE` | unset | `/run/anthropic/token` on the VM (set by `compose.prod.yml`) |
| `GEMINI_MODEL` | required | from `.env` or `/etc/atlas/atlas.env`, required |
| `GEMINI_API_KEY` | required | from `.env` (on the VM from Secret Manager), required |
| `YOUTUBE_API_KEY` | required | from `.env` (on the VM from Secret Manager), required |
| `GEMINI_BASE_URL`, `YOUTUBE_API_BASE_URL` | unset | unset (only the e2e stack sets them, to its fakes) |
| `VAULT_CREATE_ENABLED` | `true` | from `.env`, default `true` (`false` on the VM) |
| `LITESTREAM_METRICS_URL` | unset (no Replication row) | set by `compose.prod.yml` |
| `VAULT_SYNC_STATUS_DIR` | unset (no Vault sync rows) | set by `compose.prod.yml` (`/sync-status`) |
| `SUMMARY_TIMEOUT_MS` | `300000` | default |
| `REVIEW_TTL_HOURS` | `24` | default |
| `CLEANUP_INTERVAL_MINUTES` | `15` | default |
| `WEB_DIR` | unset (Vite serves the web app) | `/app/web` |
| `GOOGLE_CLIENT_ID` | required | from `.env`, required |
| `GOOGLE_CLIENT_SECRET` | required | from `.env`, required |
| `TOKEN_ENCRYPTION_KEY` | required | from `.env`, required |
| `AGENT_SECRET` | unset (linking off) | from `.env`, required |
| `AGENT_URL` | `http://localhost:8100` | `http://agent:8100` |
| `AGENT_TIMEOUT_MS` | `120000` | default |
| `LOG_LEVEL` | `info` | `${LOG_LEVEL:-info}`, for the app and the agent |
| `STATUS_CHECK_INTERVAL_MINUTES` | `2` | from `.env`, default `2` |
| `CALENDAR_REDIRECT_URI` | unset (Calendar off) | from `.env` |
| `CALENDAR_LOOKBACK_DAYS` | `14` | from `.env`, default `14` |
| `APP_TIME_ZONE` | `Asia/Singapore` | from `.env`, default as left |
| `MELETE_DAY_START_HOUR` | `4` | from `.env`, default `4` |
| `MELETE_REQUEST_RETENTION` | `0.9` | from `.env`, default `0.9` |
| `MELETE_GRADING_TIMEOUT_MS` | `20000` | from `.env`, default `20000` |
| `MELETE_GENERATION_TIMEOUT_MS` | `120000` | from `.env`, default `120000` |

- `LOG_LEVEL` is `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. Both services write one JSON object per line to the container's output, with a level and a time. A line about a job carries its `job_id` (the agent's lines for a link run carry it too), and the pollers' lines carry the feed or source. Follow one job with `docker compose logs app agent | grep <job id>`. Request bodies, note and transcript text, prompts, email content and tokens are never logged. Under `pnpm dev` the server's output is pretty-printed.
- `STATUS_CHECK_INTERVAL_MINUTES` is how often the server checks the agent service, the transcription model, replication and vault sync in the background.
- Calendar (ADR 0108) is off until `CALENDAR_REDIRECT_URI` is set to `https://<your origin>/api/calendar/oauth/callback`, which must also be an authorised redirect of the same Google OAuth client that Gmail uses (see `docs/google-cloud-setup.md`). `CALENDAR_LOOKBACK_DAYS` (1–90) is how far back a sync reads. `CALENDAR_API_BASE_URL` is for the e2e stack only and the server refuses to start with it outside `NODE_ENV=test`.
- The Melete variables are all optional. `APP_TIME_ZONE` (an IANA name such as `Asia/Singapore`) and `MELETE_DAY_START_HOUR` (0–23) decide when "today" starts for the new-questions-per-day limit. `MELETE_REQUEST_RETENTION` (above 0.7, up to 0.99) is the share of questions you aim to remember when they come back; higher means more reviews. The two timeouts bound one question-generation call and one grading call.
- Gemini (ADRs 0081, 0083): the server calls the Gemini Developer API (`generativelanguage.googleapis.com`) with `GEMINI_API_KEY`, sent as a header and never logged or shown in an error. Make the key in Google AI Studio against the `atlas` project, on a **paid** tier (billing on): on the free tier inputs may be used to improve Google's products and YouTube input is capped at 8 hours a day. Restrict it to the Generative Language API. `GEMINI_MODEL` names the model. (Vertex AI was tried first and is no longer used: it refused YouTube input from the VM's service account.) The Status panel's Transcription row reads the model resource, which costs nothing. The model's name is stored on each transcript, and each run records Gemini's input and output tokens; the cost is an estimate from a price table in the code (admin usage) and should be checked against the Google Cloud console. `YOUTUBE_API_KEY` (restricted to the YouTube Data API v3) gets a video's title, channel and length, one quota unit a call, before Gemini is asked.
- `VAULT_CREATE_ENABLED=false` (the VM) stops the app creating a new vault folder at onboarding, because a folder without a sync client would never reach Obsidian; people claim a folder the admin has set up. `LITESTREAM_METRICS_URL` (Litestream's metrics address) and `VAULT_SYNC_STATUS_DIR` (the folder the sync containers write status files to) turn on the Replication and Vault sync rows; `compose.prod.yml` sets both.
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `TRANSCRIPTION_MODEL`, `POT_PROVIDER_URL`, `WORK_DIR`, `GOOGLE_CLOUD_PROJECT`, `GEMINI_LOCATION`, `GEMINI_ACCESS_TOKEN`, `WHISPER_URL`, `WHISPER_MODEL`, `BACKUP_DIR` and `BACKUP_HOST_PATH` were removed in 0.10.0; a leftover value is ignored and logged as a warning at startup.
- `COMPOSE_FILE` is a Compose variable, not the server's: `.env.example` sets it to `docker-compose.yml:compose.local.yml`, so plain `docker compose` builds and runs the images from this checkout. On the VM the `atlas` service names `docker-compose.yml` and `compose.prod.yml` itself and reads `/etc/atlas/atlas.env` and the secrets ([`docs/deploy.md`](deploy.md)).
- `WEB_DIR` is the folder with the built web app; when set, Express serves it.
- `DATA_DIR` holds `atlas.db` (on the VM Litestream replicates it; [`docs/deploy.md`](deploy.md#restoring-the-database) says what is in the replica and how to restore), and a `pre-migration/` folder with the copies made before an upgrade changes the database. `VAULTS_PATH` must exist and be writable at startup, or the server exits with a message.
- `ADMIN_EMAIL` (lower-cased) is the one account that can sign in to an empty app. `APP_ORIGINS` lists the addresses the app is served at, comma-separated, as `scheme://host[:port]` with no path (for example `http://localhost:3100,https://mac.tailnet.ts.net`); a sign-in from any other address is refused with a 400, and each address needs its redirect URIs in Google ([`docs/google-cloud-setup.md`](google-cloud-setup.md)). `SESSION_DAYS` (1–365) is how long a sign-in lasts without use. `VAULTS_PATH` is the folder that holds one vault folder per person; each person's vault is `VAULTS_PATH/<their folder>`.
- `DEFAULT_NOTE_FOLDER` is the folder in the person's vault that notes go to unless they pick another in the review screen. It is relative to the vault, is created when a note is first saved there, and must be a plain path such as `Notes/Videos` (no `..`, no leading `/`, no folder starting with a dot). The server never writes outside the vault, whatever folder is asked for.
- The three Google variables are required: they run sign-in and, if someone connects it, Gmail. `TOKEN_ENCRYPTION_KEY` must be 32 bytes in base64 (`openssl rand -base64 32`); any other value stops the server at startup with a message. The redirect URIs are derived from `APP_ORIGINS`, so `GOOGLE_REDIRECT_URI` and `VAULT_PATH` (and `VAULT_HOST_PATH` for Compose, now `VAULTS_HOST_PATH`) are gone from 0.9.0: a leftover `GOOGLE_REDIRECT_URI` or `VAULT_PATH` is ignored and logged as a warning at startup.
- `AGENT_SECRET` (at least 32 characters; `openssl rand -hex 32`) must be the same for the app and the agent service; in Docker one `.env` value feeds both. Without it the server starts with linking off and Settings says how to set it up. `AGENT_TIMEOUT_MS` is how long the server waits for one linking run; the agent's own run limit is 90 seconds. `AGENT_SYLLABUS_TIMEOUT_MS` (default 200000) is how long it waits for one syllabus draft, kept above the agent's own 180 seconds so the agent reports its own timeout. The agent service reads `ANTHROPIC_API_KEY`, `AGENT_SECRET` and `VAULTS_ROOT` (the vaults folder, mounted read-only; each request names the person's vault folder and the agent refuses anything that isn't a real folder directly inside it), plus optional limits named `AGENT_MAX_TURNS`, `AGENT_MAX_TOOL_CALLS`, `AGENT_MAX_OUTPUT_TOKENS`, `AGENT_RUN_TIMEOUT_SECONDS`, `AGENT_MAX_SUGGESTIONS`, `AGENT_LIST_NOTES_LIMIT`, `AGENT_SEARCH_HITS_LIMIT`, `AGENT_SEARCH_SNIPPET_CHARS`, `AGENT_READ_NOTE_CHARS` and `AGENT_LINK_TARGETS_LIMIT` and, for syllabus drafting, `SYLLABUS_MAX_TURNS` (16), `SYLLABUS_MAX_TOOL_CALLS` (40), `SYLLABUS_MAX_OUTPUT_TOKENS` (8192) and `SYLLABUS_TIMEOUT_SECONDS` (180) (the defaults are in `apps/agent/src/atlas_agent/config.py`).
- **Claude credentials (ADR 0110): exactly one mode.** On the Mac set `ANTHROPIC_API_KEY` in `.env`, never in the repo (in Docker, `.env` at the repo root feeds both Compose and the app container; `compose.local.yml` hands it to the agent). On the VM there is no key: set the four federation IDs in `/etc/atlas/atlas.env` and the helper keeps `ANTHROPIC_IDENTITY_TOKEN_FILE` current (see [deploy.md](deploy.md#claude-sign-in-workload-identity-federation-from-13)). Each service refuses to start, naming the variables, when a key and any federation variable are both set, when neither is, when federation is only partly set, when the token file does not exist, or when `ANTHROPIC_API_KEY` is **present but empty** beside federation. That last one matters: an exported empty key makes the SDK take the key path with an empty key instead of federating. So no Compose file ever names the key as `${ANTHROPIC_API_KEY:-}` (unset it, don't blank it), and the VM's `atlas.env` must not contain it. The Status panel's Claude API row says which mode is in use.
- For development, see [A local `.env` for development](#a-local-env-for-development).
- **The agent service outside Docker.** It needs [uv](https://docs.astral.sh/uv/) and Python 3.14. Run `ANTHROPIC_API_KEY=… AGENT_SECRET=… VAULTS_ROOT=/path/to/vaults pnpm --filter @atlas/agent dev` (port 8100, reloading), and put the same `AGENT_SECRET` and `AGENT_URL=http://localhost:8100` in `apps/server/.env`. The agent only reads vaults, so any copy of a vaults folder works. Stop the agent container first if it is running.

## A local `.env` for development

Copy `apps/server/.env.example` to `apps/server/.env`. `pnpm dev` and `pnpm --filter @atlas/server test:integration` both load it. A current file needs:

| Variable | Value for development |
| --- | --- |
| `ANTHROPIC_API_KEY` | your Claude API key (the Mac always uses a key, ADR 0110) |
| `GEMINI_MODEL`, `GEMINI_API_KEY` | the Gemini model name and key |
| `YOUTUBE_API_KEY` | a YouTube Data API v3 key |
| `ADMIN_EMAIL` | the Google account that becomes the admin |
| `APP_ORIGINS` | `http://localhost:5173` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` | the Google client and `openssl rand -base64 32` |
| `VAULTS_PATH` | a folder that holds one folder per person; any folder works for trying it out |

Add `http://localhost:5173/api/auth/callback` to the Google client for sign-in. Old entries such as `WHISPER_URL` and `VAULT_PATH` are ignored (a warning is logged at startup); delete them.

The integration tests (`*.integration.test.ts`) call the real Claude API and skip without `ANTHROPIC_API_KEY`. They fill in placeholders for `GEMINI_MODEL`, `GEMINI_API_KEY`, `YOUTUBE_API_KEY`, `ADMIN_EMAIL` and `APP_ORIGINS` when those are unset or empty, so a `.env` with only the Claude key is enough; a real value always wins.

Every variable also has a one-line comment in `.env.example` (Compose) and `apps/server/.env.example` (development).
