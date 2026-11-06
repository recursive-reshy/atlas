# Atlas v0.10.0 — Technical Requirements

Companion to `docs/v0.10.0/prd.md`. The PRD says what; this says how. Where an ADR referenced in `tasks.md` conflicts with this document, the ADR wins until Naresh updates the TRD.

Written against the 0.9.1 code at commit `15698c4`. Names below are the real ones in the repo before the rename; "new" marks anything that doesn't exist yet. After checkpoint A, read `@mnemosyne/*` as `@atlas/*` and `mnemosyne_agent` as `atlas_agent` everywhere below.

**Verify before relying on it.** Four things here come from vendor docs read on 2026-11-02 and can drift: OpenAI's transcription API (§3), Obsidian Headless (open beta, §5), Litestream 0.5's config keys and metric names (§6), and Google's Debian image contents (§8). The task that first touches each one checks the current docs for the pinned version and records any difference in the task's log line (or as an ADR if it changes a decision).

## 1. Changes at a glance
- **Rename** (ADR 0073): app, packages, Python package, Compose project, images, database file, cookie and docs become Atlas. The transcriber module keeps its internal ID `transcriber` and is labelled **Mnemosyne**; the `mnemosyne` note tag and `Mnemosyne` default folder stay. A guard test keeps stray names out.
- **Transcription** (ADR 0074): whisper-server is replaced by OpenAI's `/v1/audio/transcriptions` with `gpt-transcribe`, called with `fetch` (no SDK). Video transcripts become plain text: no segments, no timestamps, no caret sync, no `.srt`, and video summaries take the article shape. Each transcription is costed in a new `transcription_runs` table and appears in the usage rollup.
- **Vault sync** (ADR 0075): one Obsidian Headless container per synced user, built from our own image, writing a status file the app reads. Creating a new vault folder at onboarding can be switched off (it is, on the VM).
- **Backups → Litestream** (ADR 0076): manual backups are retired; Litestream replicates the database to GCS from a sidecar, and a one-shot restore service rebuilds it on a fresh VM. Pre-migration copies move next to the database. `busy_timeout = 5000`.
- **Status**: rows for whisper-server and backups go; rows for transcription, replication (admin) and vault sync (per user) come, each only where configured.
- **Hosting** (ADR 0077): one e2-small Debian VM in `asia-southeast1` in a new `atlas` project; secrets from Secret Manager rendered into tmpfs at start (ADR 0078); three Compose files (shared, local, prod); images built on the Mac and pushed to Artifact Registry; a bootstrap script, a systemd unit, release and deploy scripts, and a runbook.
- **Schema:** one migration (10): `transcription_runs`, the `usage_events` view, and the health tables' kind checks. `SCHEMA_BASE` stays 9.
- **New dependencies:** none in the app, server, web or agent. New container images: `litestream/litestream` (pinned 0.5.x) and our own `atlas-sync` (node:24-slim + pinned `obsidian-headless`).
- **Environment (server):** new `OPENAI_API_KEY` (required), `OPENAI_BASE_URL`, `TRANSCRIPTION_MODEL`, `VAULT_CREATE_ENABLED`, `LITESTREAM_METRICS_URL`, `VAULT_SYNC_STATUS_DIR`. Removed (ignored with a startup warning): `WHISPER_URL`, `WHISPER_MODEL`, `BACKUP_DIR`, `BACKUP_HOST_PATH`.

## 2. Rename (ADR 0073)

### 2.1 What changes
| Thing | Before | After |
| --- | --- | --- |
| Workspace packages | `@mnemosyne/shared`, `/server`, `/web`, `/agent`, root and e2e package names | `@atlas/…` |
| Python package | `apps/agent/src/mnemosyne_agent` | `apps/agent/src/atlas_agent` (pyproject name `atlas-agent`) |
| Compose | no project name (folder name), services `mnemosyne`, `agent`, volume `mnemosyne-data` | `name: atlas`, services `app`, `agent`, volume `data` |
| Images | `mnemosyne:local`, `mnemosyne-agent:local` | `atlas-app:local`, `atlas-agent:local` (local); registry names in §8.6 |
| Database file | `mnemosyne.db` | `atlas.db` |
| Session cookie | `mnemosyne_session` | `atlas_session` |
| UI | page title, PWA manifest name/short name, drawer header, sign-in and not-allowed pages say Mnemosyne | Atlas |
| Drawer module label | `Transcriber` (`NavDrawer.tsx`, `moduleLabels.ts`) | `Mnemosyne` |
| Logs | any logger `name` or service field | `atlas` |
| e2e | project `mnemosyne-e2e`, image `mnemosyne-e2e:local`, service `mnemosyne` | `atlas-e2e`, `atlas-e2e:local`, `app` |
| Docs | root README, `CLAUDE.md` files, `docs/README.md` | Atlas; past version folders and ADRs 0001–0072 untouched |

### 2.2 What stays
- Module ID `transcriber` in the `user_modules` check, routes, shared enums and code.
- The locked `mnemosyne` note tag and the default note folder `Mnemosyne` (`config.ts` default for `DEFAULT_NOTE_FOLDER`).
- Commit scope stays version-scoped: `feat(0.10-<id>)`.

### 2.3 Guard
New test `scripts/nameGuard.test.mjs` (root, run by `pnpm test` at the root): `git grep -n -i mnemosyne` over tracked files must match only an allow-list:
- `docs/v0.*/` except `docs/v0.10.0/`, and `docs/decisions/00[0-6]*`, `docs/decisions/007[0-2]*`;
- `docs/v0.10.0/`, ADR 0073 and `docs/README.md` lines that name the module or the history;
- the tag and folder defaults and their tests (exact files listed in the test);
- the module label (`moduleLabels.ts`, `NavDrawer.tsx`) and their tests;
- the summarizer's locked note-tag constant.
A new match outside the list fails with the file and line. Adding to the allow-list is a deliberate edit.

### 2.4 Local data after the rename
Docker on the Mac starts with an empty `atlas.db` in a new `atlas_data` volume. The old `mnemosyne_mnemosyne-data` volume is left alone; the README says how to remove it. `pnpm dev` uses `apps/server/.env`'s `DATABASE_PATH` if set, otherwise its default, which also becomes `atlas.db`.

## 3. Transcription (ADR 0074)

### 3.1 Shared contracts (`packages/shared`)
```ts
// transcript.ts
TranscriptMeta = { title, source, channel, duration_seconds, transcribed_at, model }   // unchanged
// Segment and Transcript are removed.

// source.ts
VideoSource = { kind: 'video', meta: TranscriptMeta, text: string /* min 1 */ }    // was segments: Segment[]

// api.ts
DownloadFormat = 'md' | 'txt'                                                       // 'srt' removed

// paragraphs.ts
splitParagraphs( text: string ): string[]                                          // replaces groupParagraphs( segments )
```
`splitParagraphs` keeps the text's own blank-line breaks; a block longer than 1,200 characters is split at sentence ends into paragraphs of about 400–800 characters. Whitespace is trimmed, empty paragraphs dropped. It is the only paragraphing used by the web view and the `.md`/`.txt` downloads.

### 3.2 Audio preparation (`clients/ffmpeg.client.ts`)
`convertToWav` is replaced by:
```ts
prepareAudio( inputPath: string ): Promise< string[] >   // paths of one or more upload-ready pieces, in order
```
1. Encode the whole input once: mono, 16 kHz, Opus in WebM at 24 kbit/s (`-vn -ac 1 -ar 16000 -c:a libopus -b:a 24k -application voip out.webm`). About 10.8 MB an hour, so a two-hour video is one upload. WebM is in OpenAI's accepted list (`mp3, mp4, mpeg, mpga, m4a, wav, webm`).
2. If the file is at most `MAX_UPLOAD_BYTES` (24 MB, under the API's 25 MB), return it.
3. Otherwise split into `ceil( size / MAX_UPLOAD_BYTES )` roughly equal parts. For each cut point, run `silencedetect` (`-af silencedetect=noise=-35dB:d=0.4`) over ±30 s around it and cut at the middle of the nearest silence; with none, cut at the point itself. Cut with `-ss/-to -c copy` into `part-NN.webm`. Re-check each part's size; one over the limit is an error ("Audio could not be split under the upload limit").
4. Empty or missing output is the same error as today ("ffmpeg did not produce an audio file").

**Verify:** at implementation, check the API reference for a per-request duration limit on `gpt-transcribe`. If there is one, also split at that duration, and record it in the log line.

### 3.3 Client (`clients/openaiTranscription.client.ts`, new; replaces `whisperServer.client.ts`)
```ts
transcribePieces( pieces: string[], options: { baseUrl: string, apiKey: string, model: string } ): Promise< string >
checkTranscriptionModel( options ): Promise< void >   // for the Status row
```
- One `POST {baseUrl}/v1/audio/transcriptions` per piece, in order, `multipart/form-data`: `file`, `model`. From the second piece on, `prompt` = the last 200 characters of the text so far (OpenAI's guide suggests a prompt to carry context across chunks). Response parsed with Zod: `{ text: string }` (other fields ignored).
- Per-request timeout 30 minutes. On 429 or 5xx, one retry after 5 s, then fail.
- Errors are readable and never contain the key: `"OpenAI transcription failed (401): <error.message>"`, `"Could not reach OpenAI: <reason>"`, `"OpenAI transcription timed out after 30 minutes"`.
- Pieces' texts are trimmed and joined with a blank line. An empty result is an error ("OpenAI returned an empty transcript").
- `checkTranscriptionModel`: `GET {baseUrl}/v1/models/{model}`; 200 passes; anything else throws with the status and message. Free to call.
- No new dependency: `fetch`, `FormData`, `Blob` as in the old client.

### 3.4 Video adapter (`sources/video.adapter.ts`)
`downloading → converting → transcribing` as today: `downloadWithRetry`, then `prepareAudio`, then `transcribePieces`. The result is `VideoSource { kind: 'video', meta: { …meta, transcribed_at, model: config.transcriptionModel }, text }`. Work-folder cleanup unchanged. The adapter records a transcription run (§3.6) on success and on failure after the API was called.

### 3.5 Summaries (`clients/claude.client.ts`, `summarizer/prompts.ts`, `formatters/`)
- One result schema for both kinds: today's `ArticleSummaryResult` becomes `SummaryResult` (`overview`, `key_points: string[]`, `quotes: string[]`, `tags`). `Timestamped` and the video `SummaryResult` go. `Summary = { kind: 'video' | 'article' } & SummaryResult`.
- `toUserMessage` for a video: `# <title>\n\n<text>` like an article; `toTranscriptLines` goes.
- `LOCKED_INSTRUCTIONS_VIDEO` loses the bracketed-seconds sentence and the "with the second" parts; it keeps "transcript of a video". It asks for the same fields as the article contract. The seeded prompt-profile guidance (business, coding) is unchanged: it talks about videos, not seconds.
- `summary.formatter.ts`: video key points and quotes are formatted like an article's (no stamp, no YouTube link). `formatClock`/YouTube-link code goes if nothing else uses it. Front-matter for video notes is unchanged (source, channel, duration, model…).
- `summary.cleanup.ts`: drop anything that only existed for seconds.
- Downloads: `formatMarkdown` and `formatTxt` render `splitParagraphs( text )`; `srt.formatter.ts` and `timestamps.ts` are deleted; `jobs.service.ts`'s format table loses `srt`.

### 3.6 Cost (`summarizer/pricing.ts`, new table)
```ts
TRANSCRIPTION_PRICES_PER_MINUTE: Record< string, number > = { 'gpt-transcribe': 0.0045 }  // checked 2026-11-02
estimateTranscriptionCostUsd( model, seconds ): number | null   // null for an unknown model
```
Migration 10 adds:
```sql
CREATE TABLE transcription_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  model TEXT NOT NULL,
  audio_seconds INTEGER NOT NULL,
  pieces INTEGER NOT NULL,
  cost_usd REAL,
  outcome TEXT NOT NULL CHECK ( outcome IN ( 'ok', 'error' ) ),
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX transcription_runs_user ON transcription_runs ( user_id, created_at );
```
and recreates `usage_events` with a fifth branch:
```sql
SELECT user_id, 'transcription', NULL, NULL, cost_usd, created_at FROM transcription_runs
```
`audio_seconds` is the video's `duration_seconds` (ADR 0069), which is what OpenAI bills. A failed request that OpenAI may have billed is recorded with `outcome = 'error'` and its estimated cost; a failure before the first request (download, ffmpeg) records nothing. The admin usage view and its shared types gain the `transcription` category; tokens show as "—" for it. New repository `transcriptionRuns.repository.ts` with the same isolation tests as the other run tables (ADR 0062).

### 3.7 Web
- `SourcePane`: a video shows `splitParagraphs( text )` like an article; timestamp links and seconds labels go.
- Caret sync goes: `ReviewScreen`'s `handleCaretLine` / `onCaretText`, `NoteEditor`'s caret callback, `caretText.ts` and their tests, and the caret part of `ReviewScreen.browser.test.tsx`. ADR 0034 is superseded.
- `DownloadLinks`: `.srt` button goes.
- `groupParagraphs` and its tests go with `Segment`.

### 3.8 Config (`config.ts`)
| Variable | Rule |
| --- | --- |
| `OPENAI_API_KEY` | required, non-empty |
| `OPENAI_BASE_URL` | default `https://api.openai.com`; e2e and tests point it at fakes |
| `TRANSCRIPTION_MODEL` | default `gpt-transcribe` |
| `WHISPER_URL`, `WHISPER_MODEL` | removed → `IGNORED_VARIABLES` (startup warning) |

## 4. Status panel

### 4.1 Kinds (`packages/shared/src/status.ts`, migration 10)
```ts
AppHealthKind  = 'agent' | 'transcription' | 'replication'               // 'whisper', 'backup' removed
UserHealthKind = 'feed' | 'gmail_source' | 'gmail_connection' | 'vault_sync'
```
Migration 10 rebuilds `health_status` and `health_errors` (create new, copy rows whose kind is still valid, drop, rename) with
`CHECK ( ( kind IN ( 'agent', 'transcription', 'replication' ) ) = ( user_id IS NULL ) )`. Rows of `whisper` and `backup` are dropped.

### 4.2 Checks (`services/health.service.ts`, `services/status.service.ts`)
All run on the existing timer (`STATUS_CHECK_INTERVAL_MINUTES`) and record through `recordCheck` (ADR 0050).
- **Transcription** (admin, always): `checkTranscriptionModel`. Name "Transcription (OpenAI)".
- **Replication** (admin, only when `LITESTREAM_METRICS_URL` is set): `GET` the metrics text (2 s timeout) and parse it as Prometheus text exposition. Failing if unreachable, or if Litestream's sync-error counter for the database has increased since the previous check. `detail` = the last successful sync time when Litestream exposes it (`{ last_sync_at }`), shown as "Last synced …". Never failing only because the last sync is old. **Verify:** take the metric names from the pinned Litestream version (`curl :9090/metrics` in the task) and name them in a constant with a comment.
- **Vault sync** (per user, only when `VAULT_SYNC_STATUS_DIR` is set): for each user with a `vault_dir`, read `<dir>/<vault_dir>.json` (§5.3). Failing if the file is missing, unparseable, `state = 'failed'` (message = `last_error`), or `heartbeat_at` older than 5 minutes ("The sync container has stopped"). Subject ID = the user's `vault_dir`. Shown to that user (with their feeds and Gmail) and to the admin (all users, with the user's name).
- Removed: `checkWhisper`, the backup subject and `describeBackup`, `BackupControls` in `StatusTableRow` / `StatusCard`.
- Rows appear only for configured checks; a row for a check that is no longer configured is deleted at startup (`deleteHealth`), so the Mac never shows stale VM rows.

## 5. Vault sync (ADR 0075)

### 5.1 Image (`deploy/sync/Dockerfile`, new)
`node:24-slim`, `npm install -g obsidian-headless@<pinned>` (exact version, checked against Obsidian's docs in the task), `USER node` (UID 1000), `umask 022` in the start script so the agent (UID 10001) can read every note. Entrypoint `deploy/sync/sync.sh`. Built and pushed with the app and agent images (§8.6).

### 5.2 One-time setup (runbook, per user, by hand)
```sh
docker compose run --rm sync-<user> ob login                       # interactive, 2FA prompted
docker compose run --rm sync-<user> ob sync-setup --vault "<remote vault>" --path /vault --device-name atlas-vm
docker compose run --rm sync-<user> ob sync-config --path /vault --file-types "" --configs "" --conflict-strategy conflict
docker compose run --rm sync-<user> ob sync --path /vault          # first download, one-off
```
The login and sync state live in the service's own volume (`sync-<user>-config`, mounted at the CLI's config directory; the task finds that path for the pinned version). No Obsidian credential is in Secret Manager or any file in the repo.

### 5.3 Start script and status file (`deploy/sync/sync.sh`)
- Loop: run `ob sync --continuous --path /vault`, capturing stderr's last line. On exit, write `failed` with that line, wait (10 s, doubling to 5 min), and run again. A clean start resets the wait.
- A background loop writes the status file every 60 s while the sync process runs.
- File: `/status/<VAULT_DIR>.json`, written atomically (temp file + `mv`):
```json
{ "state": "running", "since": "<ISO>", "heartbeat_at": "<ISO>", "last_error": null, "cli_version": "<x.y.z>" }
```
`state` is `starting`, `running` or `failed`. Schema mirrored in `packages/shared/src/status.ts` as `VaultSyncStatusFile` (Zod) and read only by the server.
- The script is POSIX `sh`, passes `shellcheck`, and has a test (`deploy/sync/sync.test.sh` or a Vitest test that runs it with a fake `ob`) covering: running → heartbeat, crash → failed with the line → restart, backoff doubling.

### 5.4 Onboarding (`services/vaultOnboarding.service.ts`, web)
New `VAULT_CREATE_ENABLED` (default `true`; `false` on the VM). When false, `createVault` answers 403 ("New vaults are set up by the admin"), the onboarding response gains `can_create: false`, and the onboarding page hides **New vault** and says "If your vault isn't listed, ask the admin to set up its sync." Claiming an existing folder is unchanged.

## 6. Database replication (ADR 0076)

### 6.1 App changes
- `openDatabase`: `PRAGMA busy_timeout = 5000` right after opening (before `journal_mode = WAL`). Test: the pragma reads back 5000.
- Pre-migration and pre-0.9 set-aside copies go to `<dirname( databasePath )>/pre-migration/` instead of a backups folder; `OpenOptions.backupDir` goes. `backupStamp` stays for the file names.
- Retired: `services/backup.service.ts` and its route(s), `BackupControls`, `config.backupDir`, `BACKUP_DIR` (→ `IGNORED_VARIABLES`), the backups mount and `BACKUP_HOST_PATH` in Compose and `.env.example`. ADR 0051 is superseded; `docs/backups.md` becomes a short page pointing at the runbook's restore section.

### 6.2 Litestream (`deploy/litestream/litestream.yml`, new)
Pinned `litestream/litestream:0.5.<x>` (latest 0.5 at implementation). Config in the 0.5 shape (`replica:` per database; snapshot and retention as their own top-level blocks):
- database `/data/atlas.db`;
- replica: GCS, bucket `${LITESTREAM_BUCKET}`, path `atlas.db`, credentials from the VM's service account (no key);
- sync interval 1 s; daily snapshot; retention 7 days (168 h);
- `addr: ":9090"` for metrics (internal network only, never published).
**Verify:** the key names against litestream.io for the pinned version.

### 6.3 Compose services (prod only)
- `restore`: one-shot, `litestream restore -if-db-not-exists -if-replica-exists -o /data/atlas.db gcs://…` (or the config form), `user: "1000:1000"` so the restored file belongs to the app's user. Exits 0 when there is nothing to do.
- `app`: `depends_on: restore: condition: service_completed_successfully`.
- `litestream`: `replicate`, `user: "1000:1000"`, shares the `data` volume, `restart: unless-stopped`, `depends_on: app` (service_started).
- Restore to a point in time: runbook only (`docker compose stop app litestream`, `restore -timestamp …` into a temp file, swap, start).

## 7. Secrets (ADR 0078)
- Secret Manager in the `atlas` project holds exactly: `anthropic-api-key`, `openai-api-key`, `agent-secret`, `google-client-secret`, `token-encryption-key`.
- `deploy/vm/fetch-secrets.sh` (new): for each name, read the latest version and write `KEY=value` lines to `/run/atlas/secrets.env` (`umask 077`, owned by root, directory created 0700). Prefers `gcloud secrets versions access latest --secret=<name>`; if `gcloud` is absent, gets a token from the metadata server and calls the Secret Manager REST API with `curl`. Fails loudly (non-zero, no partial file) if any secret is missing. Never echoes values.
- `deploy/vm/atlas.service` (systemd): `ExecStartPre=/opt/atlas/fetch-secrets.sh`, `ExecStart=docker compose --env-file /etc/atlas/atlas.env --env-file /run/atlas/secrets.env -f docker-compose.yml -f compose.prod.yml up -d --wait`, `ExecStop=… down`, `Type=oneshot`, `RemainAfterExit=yes`, after `docker.service` and `network-online.target`.
- `/etc/atlas/atlas.env` (non-secret, from `deploy/vm/atlas.env.example`): `ATLAS_VERSION`, `REGISTRY`, `ADMIN_EMAIL`, `APP_ORIGINS`, `GOOGLE_CLIENT_ID`, `VAULTS_HOST_PATH=/srv/atlas/vaults`, `LITESTREAM_BUCKET`, `APP_TIME_ZONE`, `VAULT_CREATE_ENABLED=false`, optional tunables.
- Rotation: add a secret version, `sudo systemctl restart atlas`.
- Local development keeps `.env` / `apps/server/.env`.

## 8. Hosting and deployment (ADR 0077)

### 8.1 Compose files
| File | Contents |
| --- | --- |
| `docker-compose.yml` | `name: atlas`; services `app` and `agent`: environment names, health checks, `stop_grace_period`, agent `read_only`/`tmpfs`, `restart`; port `127.0.0.1:3100:3100`; volume `data`. No `build`, no `image`, no vault mount. |
| `compose.local.yml` | `build:` for both; `image: atlas-app:local` / `atlas-agent:local`; `env_file: .env`; vaults bind mount from `VAULTS_HOST_PATH` (rw for app, ro for agent). |
| `compose.prod.yml` | `image: ${REGISTRY}/app:${ATLAS_VERSION}` and `/agent:…`; vaults bind mount `/srv/atlas/vaults`; `LITESTREAM_METRICS_URL=http://litestream:9090/metrics`, `VAULT_SYNC_STATUS_DIR=/sync-status` (ro mount of the `sync-status` volume); services `restore`, `litestream`, `sync-naresh` (image `${REGISTRY}/sync:${ATLAS_VERSION}`, mounts `/srv/atlas/vaults/<dir>` at `/vault`, `sync-status` at `/status`, its config volume; `VAULT_DIR` env). |
- `.env.example` sets `COMPOSE_FILE=docker-compose.yml:compose.local.yml` so `docker compose up` on the Mac uses local. The e2e override layers on the same two.
- A second synced user is one more `sync-<name>` block in `compose.prod.yml` (commented template in the file).
- Test (`scripts/compose.test.mjs`, root): `docker compose … config --quiet` succeeds for local and for prod with `deploy/vm/atlas.env.example` plus a dummy secrets file; the prod config contains no `build:`; no service publishes a port except `app` on `127.0.0.1`. Skipped when `docker` isn't installed.

### 8.2 Cloud resources (runbook, `gcloud`, by Naresh)
Project `atlas` (ID chosen at creation), billing linked, APIs enabled (Compute, Artifact Registry, Secret Manager, Cloud Storage, IAM). Then:
- Artifact Registry Docker repo `atlas` in `asia-southeast1`.
- Bucket for the database, `asia-southeast1`, Standard, uniform access, public access prevention on.
- Service account `atlas-vm` with: `secretmanager.secretAccessor` on each of the five secrets; `storage.objectAdmin` on the bucket; `artifactregistry.reader` on the repo. Nothing project-wide.
- The five secrets.
- Firewall: delete the default network's `default-allow-ssh`, `default-allow-rdp` and `default-allow-icmp`; add `allow-iap-ssh` (tcp:22 from `35.235.240.0/20`). No other ingress.
- VM `atlas` (name may differ): e2-small, `asia-southeast1-b` (or any zone with capacity), current Debian image, 20 GB balanced persistent disk, service account `atlas-vm` with the `cloud-platform` scope (IAM does the limiting), ephemeral external IP, shielded VM on.
- OAuth client in the new project per the rewritten `google-cloud-setup.md`, with the VM's Tailscale origin and redirect URIs, published **In production**.
The runbook lists each command and the monthly price of the VM, disk and IP from Google's price list on the day it is written.

### 8.3 Bootstrap (`deploy/vm/bootstrap.sh`, new, idempotent, run as root once and after any change)
Installs Docker Engine and the Compose plugin from Docker's apt repository; Tailscale from its apt repository; `unattended-upgrades` (security updates); a 2 GB swap file in `/etc/fstab`; Docker daemon log options (`json-file`, `max-size 10m`, `max-file 3`); `gcloud auth configure-docker asia-southeast1-docker.pkg.dev` (or a credential helper using the metadata token if `gcloud` is absent); `/opt/atlas` with the Compose files, `fetch-secrets.sh`, `deploy.sh`, the litestream config; `/srv/atlas/vaults` owned by 1000:1000; `/etc/atlas/atlas.env` from the example if missing (never overwritten); installs and enables `atlas.service`. Passes `shellcheck`.

### 8.4 Tailscale on the VM (runbook)
`tailscale up --ssh --hostname=<non-revealing name>` (open the printed link); disable key expiry for the machine in the admin console; MagicDNS and HTTPS already on (from `phone-access.md`); `tailscale serve --bg 3100`. The printed address goes into `APP_ORIGINS` and the OAuth client.

### 8.5 Memory
e2-small has 2 GB. The bootstrap adds 2 GB swap. The release check records `docker stats --no-stream` during a video job; if the app is OOM-killed or swap use stays high, the runbook's resize step (stop, `set-machine-type e2-medium`, start) is the fix, not a code change.

### 8.6 Images, release and deploy
- `deploy/release.sh <version>` (Mac): checks the tree is clean and the version matches `package.json`; `docker buildx build --platform linux/amd64` for `app` (root `Dockerfile`), `agent` (`apps/agent/Dockerfile`) and `sync` (`deploy/sync/Dockerfile`); tags `${REGISTRY}/<name>:<version>`; pushes. `REGISTRY` from the environment or `deploy/release.env` (git-ignored).
- `deploy/vm/deploy.sh <version>` (VM, root): sets `ATLAS_VERSION` in `/etc/atlas/atlas.env`, copies the repo's Compose files and scripts for that version if passed `--files <dir>` (otherwise keeps the installed ones), `docker compose pull`, `systemctl restart atlas`, waits up to 3 minutes for `http://127.0.0.1:3100/api/health` to answer 200, and prints the result. Rollback = `deploy.sh <previous version>`.
- From the Mac: `deploy/release.sh 0.10.0 && ssh <vm> sudo /opt/atlas/deploy.sh 0.10.0`.

## 9. Testing
- **Unit and integration:** every server, shared and web change test-first (ADR 0007). New: `openaiTranscription.client.test.ts` (fake `fetch`: one piece, two pieces with the prompt carried, 401, 429 retry, timeout, empty text, key never in an error), `ffmpeg.client.test.ts` for `prepareAudio` (small fixture audio; the split path forced with a lowered limit), `transcriptionRuns.repository.test.ts`, pricing, health checks with fake metrics text and status files, `vaultOnboarding` with creation disabled, config ignored variables, migration 10 (fresh and from the 0.9 schema, health rows migrated and old kinds dropped).
- **Removed tests** go with their code (`srt`, `timestamps`, `caretText`, caret browser test, `groupParagraphs`, backup service and controls, whisper client). Each removal is listed in the task's log line.
- **Agent:** only the rename; its 280 tests pass.
- **e2e:** stays on article and feed paths (ADR 0053). The fakes server gains `GET /v1/models/gpt-transcribe` (so the Transcription row is healthy) and `POST /v1/audio/transcriptions` (returns fixed text), and the e2e Compose sets `OPENAI_BASE_URL` and a dummy key. The fakes and run script are renamed with everything else.
- **Scripts:** `shellcheck` over `deploy/**/*.sh` (skipped with a message if not installed); the sync script test; the Compose config test.
- **No test** touches the network, GCP, OpenAI, Obsidian or a real vault.

## 11. YouTube PO tokens on the VM (ADR 0079, added 2026-11-04; superseded by §12)
Found in cutover: yt-dlp 2026.10.26 on the VM reads the page and solves the JS challenge, then gets 403 from `googlevideo.com`; verbose output shows `PO Token Providers: none`.
- **Provider:** `pot-provider` service in `compose.prod.yml`, image `brainicism/bgutil-ytdlp-pot-provider:<pinned>`, `init: true`, `restart: unless-stopped`, no published port, listening on 4416 on the Compose network.
- **Plugin:** the app `Dockerfile` downloads the matching release's plugin zip (same pinned version as the image; one build arg) into a system plugin folder the standalone binary searches. **Verify:** which folders the `yt-dlp_linux` executable loads plugins from (yt-dlp's plugin docs), and that `yt-dlp -v` lists the bgutil provider under `PO Token Providers`.
- **Config:** new optional `POT_PROVIDER_URL` (→ `config.potProviderUrl`). When set, every yt-dlp call adds `--extractor-args "youtubepot-bgutilhttp:base_url=<url>"`. **Verify** the extractor-argument name for the pinned plugin version (older versions used `youtube:getpot_bgutil_baseurl`). `compose.prod.yml` sets `POT_PROVIDER_URL=http://pot-provider:4416`; unset on the Mac, in e2e and in tests.
- **Status:** admin row "YouTube tokens" (`pot_provider` app health kind) only when configured; the check calls the provider's ping endpoint (verify its path for the pinned version) with a 2 s timeout. Unconfigured rows are pruned as in §4.2.
- **Tests:** yt-dlp argument building with and without the setting; health check with a fake server; Compose prod test (service present, no published port, app env); a Docker build check that the plugin is in place (`yt-dlp -v` output, no network) where feasible.
- **Release check:** on the VM, `yt-dlp -v` shows the provider; a video job completes. If 403 persists, stop and decide cookies in a new ADR.

## 12. Gemini for YouTube, cleanup (ADR 0081, added 2026-11-06)
Supersedes §3.2–§3.4 (audio preparation, OpenAI client, the download steps of the video adapter), §3.8's OpenAI settings and §11. §3.1 (plain-text `VideoSource`), §3.5 (summaries) and §3.7 (web) stand.

### 12.1 Gemini client (`clients/gemini.client.ts`, new)
```ts
transcribeYouTube( url: string, options: GeminiOptions ): Promise< { text: string, truncated: boolean, inputTokens: number, outputTokens: number } >
checkGeminiModel( options: GeminiOptions ): Promise< void >
GeminiOptions = { project: string, location: string, model: string, getAccessToken: () => Promise< string > }
```
- `POST https://{host}/v1/projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent`; host `aiplatform.googleapis.com` for `location = global`, else `{location}-aiplatform.googleapis.com`. **Verify** the endpoint and the recommended location for the chosen model.
- Body: one user turn with a `fileData` part (`fileUri` = canonical `https://www.youtube.com/watch?v=<id>`, `mimeType: video/*` as the docs require) and a text part with the transcription prompt (constant in `summarizer/prompts.ts` or beside the client): verbatim speech only, original language, paragraphs at natural breaks, no timestamps, speaker labels, headings, commentary or summary; `generationConfig`: `mediaResolution: MEDIA_RESOLUTION_LOW`, `temperature: 0`, `maxOutputTokens` at the model's maximum, thinking off or minimal where the model allows. **Verify** each field name for the chosen model.
- Response parsed with Zod: text parts joined; `finishReason === 'MAX_TOKENS'` → `truncated: true`; other non-`STOP` reasons (safety, recitation, "video not available") → readable error; `usageMetadata.promptTokenCount` / `candidatesTokenCount` → tokens.
- Timeout 15 minutes; one retry after 10 s on 429/5xx. Errors never contain the access token. Auth: `google-auth-library` `GoogleAuth({ scopes: cloud-platform }).getAccessToken()` (ADC).
- `checkGeminiModel`: `GET …/publishers/google/models/{model}` (free). **Verify** path.

### 12.2 YouTube metadata (`clients/youtubeData.client.ts`, new)
`getVideoMeta( videoId, apiKey ) → { title, channel, duration_seconds, privacy }` from `GET https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=…&key=…` (ISO-8601 `contentDetails.duration` parsed). No item → "Video not found or not public". `status.privacyStatus !== 'public'` → "Only public YouTube videos are supported". Runs before Gemini, so a private video costs nothing.

### 12.3 Video adapter and sources
- `video.adapter.ts`: metadata → `transcribing` → `transcribeYouTube` → `VideoSource { kind: 'video', meta: { …, model: config.geminiModel }, text }`; records a transcription run (§12.4); truncated transcripts carry `meta.truncated: true` (new optional `TranscriptMeta` field) and the review screen shows "Transcript was cut short by Gemini's output limit" above the source.
- `detectSourceType`: `VIDEO_HOSTS` is YouTube only (`youtube.com`, `youtu.be`, `m.youtube.com`); `CreateJobBody` refuses known non-YouTube video hosts (`vimeo.com`, `dailymotion.com`, `tiktok.com`, `twitch.tv`) with "Only YouTube videos are supported" rather than treating them as articles. Feeds behave the same.
- `JobStatus` loses `downloading` and `converting`.

### 12.4 Cost
`transcription_runs` gains `input_tokens INTEGER`, `output_tokens INTEGER`; `pieces` is dropped or set to 1 (task decides; document it). `GEMINI_PRICES` (per million input and output tokens, checked on the day, with the date in a comment); cost from tokens; unknown model → null. Usage view unchanged in shape.

### 12.5 Migration (next schema version)
- Health tables rebuilt with app kinds `agent`, `transcription`, `replication` only; rows of `whisper`, `backup`, `pot_provider` dropped.
- Jobs: if a `CHECK` lists statuses, rebuild without `downloading`/`converting`; any row in those states becomes `failed` with error "Interrupted by upgrade".
- `transcription_runs` columns per §12.4.
- Tests from the current VM schema (12) and from empty.

### 12.6 Config
New: `GEMINI_MODEL` (required, no default baked in beyond the example file), `GOOGLE_CLOUD_PROJECT` (required), `GEMINI_LOCATION` (default `global`), `YOUTUBE_API_KEY` (required). Removed → `IGNORED_VARIABLES`: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `TRANSCRIPTION_MODEL`, `POT_PROVIDER_URL`. `fetch-secrets.sh` and ADR 0078's list: `youtube-api-key` replaces `openai-api-key`. Local Compose mounts the Mac's ADC file read-only (`~/.config/gcloud/application_default_credentials.json`) and sets `GOOGLE_APPLICATION_CREDENTIALS`; `pnpm dev` picks ADC up directly.

### 12.7 Removal list (with their tests, fixtures and docs)
`Dockerfile`: yt-dlp download, `/etc/yt-dlp.conf`, the bgutil plugin and `BGUTIL_VERSION`, `ffmpeg` (apt), curl if nothing else needs it. `ops/docker-entrypoint.sh`: the `yt-dlp -U` step (delete the script if only `exec "$@"` remains, and its Dockerfile use). Server: `ffmpeg.client.ts`, `openaiTranscription.client.ts`, yt-dlp client/helpers and download retry, `POT_PROVIDER_URL` code, the `pot_provider` health check, `formatters/youtube.ts` if nothing uses it after §12.3. Compose: `pot-provider` service and env. e2e: OpenAI fakes replaced by Vertex and YouTube Data fakes. Docs: README, runbook (APIs, IAM, secrets), `google-cloud-setup.md`, `CLAUDE.md` files. ADRs 0079 and 0080 marked superseded.

### 12.8 Unused-code sweep
Run `knip` once (`pnpm dlx knip`, not added as a dependency) across the workspace after §12.7. Remove what is genuinely unused (files, exports, dependencies, devDependencies); list each removal, and anything kept on purpose with the reason, in the task's log. No behaviour change.

### 12.9 Cloud setup (Naresh, runbook)
Enable `aiplatform.googleapis.com` and `youtube.googleapis.com`; `gcloud projects add-iam-policy-binding … --member=serviceAccount:atlas-vm@… --role=roles/aiplatform.user`; create an API key restricted to the YouTube Data API v3 and store it as `youtube-api-key` (granting `atlas-vm` access); disable `openai-api-key`'s versions and delete it after the release; revoke the OpenAI key. On the Mac: `gcloud auth application-default login`.

### 12.10 Tests and checks
Unit: Gemini client (request shape, low resolution, truncation, safety/unavailable errors, retry, token never in errors), YouTube Data client (duration parsing, not found, not public), adapter, source detection and refusals, migration, pricing, health check, config. e2e fakes for both APIs. Release check on the VM: one short and one long (over an hour) public video; note truncation and cost.

## 10. Release notes outline (for task 9.2)
New (Atlas name, hosting on the VM, synced vaults, replication, transcription cost, YouTube transcribed by Gemini from the link), Changes (Gemini transcription of YouTube links; YouTube-only video; yt-dlp, ffmpeg and OpenAI removed; no timestamps, links or `.srt` for videos; status rows; manual backups gone; new and removed variables), Upgrading (the runbook; Mac clean-up of the old volume and the `.env` lines), Deferred (other video sites and unlisted videos, GitHub Actions, the brother's sync, uptime alerting, Terraform, MCP over the vault), Known issues (public YouTube videos only; very long videos may be truncated; Obsidian Headless is in open beta; costs are estimates).
