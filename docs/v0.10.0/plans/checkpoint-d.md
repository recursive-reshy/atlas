# Checkpoint D plan — Atlas v0.10.0, phases 5–6 (tasks 5.1–5.6, 6.1–6.2)

## Context
Checkpoints A–C made the app VM-ready (rename, OpenAI transcription, Status rows, `VAULT_CREATE_ENABLED`). Checkpoint D writes everything that runs on the VM and the docs for it: Compose split, sync image, Litestream, secrets, bootstrap, release/deploy scripts, runbook (ADRs 0075–0078, TRD §5–8). **No cloud action is run**: no `gcloud`, Tailscale, Obsidian login, registry push or VM command. Scripts are tested only with fakes on `PATH` and temp directories; nothing touches the network except my reading vendor docs (to pin versions).

Per task: failing test first (watch it fail for the right reason) → least code → refactor green → tick Status + log line in `tasks.md` → commit `feat(0.10-<id>): …` (docs: `docs(0.10-<id>): …`), staging files by name → push. After each task run tests, lint, typecheck for every touched folder. End of checkpoint: `pnpm e2e`, `docker compose build`, report.

## Before task 5.1: save this plan
Copy to `docs/v0.10.0/plans/checkpoint-d.md`, tick the Plan cell in `tasks.md`, commit `docs(0.10-plan): checkpoint D`, push.

## Conventions for all shell tasks (5.2–5.6)
- Scripts are POSIX `sh` where they run in a container (`sync.sh`), `bash` on the VM/Mac (`bootstrap.sh`, `fetch-secrets.sh`, `deploy.sh`, `release.sh`), all `set -eu`, quoted, no value echoed for secrets.
- **Tests are `node:test` files** beside the scripts (`deploy/**/*.test.mjs`), same style as `scripts/nameGuard.test.mjs`: create a temp dir with fake executables (`ob`, `gcloud`, `curl`, `docker`, `systemctl`, `apt-get`, …) first on `PATH`, run the real script, assert on its output, the files it wrote and the fakes' recorded calls. Paths the script touches (`/run/atlas`, `/etc/atlas`, `/opt/atlas`, `/srv/atlas`, status dir) are overridable by env vars (defaults are the real paths) so tests never need root. Scripts must run on macOS and Debian (no GNU-only flags).
- **Root `package.json` `test`** changes from `node --test scripts/nameGuard.test.mjs` to `node --test scripts/*.test.mjs deploy/**/*.test.mjs` (quoted glob, so `node --test` expands it). New root `lint`-style check `scripts/shellcheck.test.mjs` runs `shellcheck` over `deploy/**/*.sh` (added in 5.5; skipped with a printed message if not installed — **`shellcheck` is not installed on this Mac**, so I'll ask you to `brew install shellcheck`; until then those checks skip).
- Vendor facts (Obsidian Headless, Litestream 0.5, Debian image) are checked against current docs for the pinned version when each task starts; any difference goes in the log line (or an ADR if it changes a decision).

## 5.1 Compose split (ADR 0077)
- **Tests first** — `scripts/compose.test.mjs` (skipped with a message if `docker` is missing; `docker compose config` needs no daemon):
  - `config --quiet` passes for `docker-compose.yml:compose.local.yml` (with a dummy env) and for base + `compose.prod.yml` with `deploy/vm/atlas.env.example` + a dummy secrets file as `--env-file`s (the prod half stays red until 5.3/5.4 create those files; in 5.1 the test covers local and the e2e layering, and the prod cases are added in 5.3/5.4 when the files exist — noted in the log).
  - parsed `config --format json`: base alone has no `build`, no `image`, no `/vaults` volume; prod has no `build`; the only published port in any combination is `app` on `127.0.0.1:3100`.
  - `.env.example` has `COMPOSE_FILE=docker-compose.yml:compose.local.yml`.
- **Code:**
  - `docker-compose.yml`: keep `name: atlas`, services `app`/`agent`, health checks, `stop_grace_period`, `restart`, agent `read_only`/`tmpfs`, port `127.0.0.1:3100:3100`, `data` volume. Remove `build`, `image`, `env_file`, the vaults mounts. Because prod has no `env_file`, the base `environment:` must name every variable the containers need (required ones with `${VAR:?…}`; optional tunables the TRD lists — `APP_TIME_ZONE`, `LOG_LEVEL`, `STATUS_CHECK_INTERVAL_MINUTES`, `TRANSCRIPTION_MODEL`, `VAULT_CREATE_ENABLED`, `ADMIN_EMAIL`, `APP_ORIGINS`, `GOOGLE_*`, `TOKEN_ENCRYPTION_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AGENT_SECRET` — with `:-default` only where `config.ts` has the same default, so an unset variable is never passed as an empty string). First step of the task: check how `config.ts` treats `""` vs unset for each, and keep local's `env_file: .env` so any other optional variable still works on the Mac.
  - `compose.local.yml`: `build:` for both, `image: atlas-app:local` / `atlas-agent:local`, `env_file: .env`, vault bind mounts from `${VAULTS_HOST_PATH:?…}` (rw app, ro agent), `extra_hosts` (no longer needed for whisper → dropped).
  - `.env.example`: add `COMPOSE_FILE=docker-compose.yml:compose.local.yml` (+ comment); `apps/server/.env.example` unchanged.
  - `e2e/run.sh`: `COMPOSE` layers `docker-compose.yml`, `compose.local.yml`, `e2e/docker-compose.e2e.yml`; the e2e override already replaces `env_file`, ports and images.
- **Red → green:** compose test fails (no `compose.local.yml`) → split → green. Then `docker compose config` locally, `docker compose build`, and `pnpm e2e` (7 passed) — the task is not ticked until e2e passes.

## 5.2 Sync image and `sync.sh` (ADR 0075, TRD §5.1, §5.3)
- **Verify first:** current `obsidian-headless` release on npm and Obsidian's Headless docs: exact version to pin; command names/flags in TRD §5.2 (`login`, `sync-setup`, `sync-config`, `sync --continuous`, `--file-types`, `--configs`, `--conflict-strategy`); **config directory path** for that version (where login and sync state live → the `sync-<user>-config` volume mount point). If I can check it without logging in (read package source or `docker run … ob --help` of the built image), I do; otherwise the runbook says to confirm it on first login and the log line says so.
- **Tests first** — `deploy/sync/sync.test.mjs` runs `sync.sh` with a fake `ob` (env: `VAULT_DIR`, `STATUS_DIR`, short `HEARTBEAT_SECONDS`/`BACKOFF_*` test overrides, `OB_VERSION` from the fake `ob --version`):
  - fake `ob sync --continuous` stays up → status file `<VAULT_DIR>.json` appears with `state: running`, `since`, `last_error: null`, `cli_version`; `heartbeat_at` advances;
  - fake `ob` exits 1 printing a last stderr line → file shows `state: failed`, `last_error` = that line, then the script restarts it;
  - repeated crashes → waits double (10 s → … capped 5 min; asserted via the recorded sleep calls with a fake `sleep`), and a start that stays up resets the wait;
  - the file is written atomically (temp + `mv`; no partial JSON ever read) and parses against `VaultSyncStatusFile` imported from `@atlas/shared`;
  - umask 022 (files created by the fake `ob` are 644).
- **Code:** `deploy/sync/Dockerfile` (`node:24-slim`, pinned `npm install -g obsidian-headless@<x>`, `COPY sync.sh`, `USER node`, `ENTRYPOINT`), `deploy/sync/sync.sh`. A `.dockerignore` check: root `.dockerignore` excludes nothing under `deploy/`; the sync image builds from its own folder context.
- Image build is verified locally with `docker build deploy/sync` (no push, no login).

## 5.3 Litestream config and prod services (ADR 0076, TRD §6.2–6.3)
- **Verify first:** latest 0.5.x tag of `litestream/litestream`; config keys for the 0.5 shape (`dbs[].replica` with `type: gcs`, `bucket`, `path`; sync interval; snapshot interval; retention; `addr`), the `restore` flags (`-if-db-not-exists`, `-if-replica-exists`, `-o`, `-config`), whether `${LITESTREAM_BUCKET}` env expansion is on by default, and the metric names (already recorded in 4.3). Differences go in the log line.
- **Tests first** (extend `scripts/compose.test.mjs`; add `deploy/litestream/litestream.test.mjs`):
  - the YAML parses (using the `yaml` already in `node_modules`? — **no new dependency**: if no YAML parser is already a dev dependency I'll assert with line-level checks on the file and `docker compose config` rather than add one) and contains: db `/data/atlas.db`, GCS bucket from `${LITESTREAM_BUCKET}`, path `atlas.db`, 1 s sync, daily snapshot, 168 h retention, `:9090`;
  - prod `config`: services `restore`, `litestream`, `app`, `sync-naresh` exist; `app.depends_on.restore.condition == service_completed_successfully`; `litestream.depends_on.app.condition == service_started`; `restore` and `litestream` run as `1000:1000` and share the `data` volume; `litestream` publishes no ports; `app` has `LITESTREAM_METRICS_URL=http://litestream:9090/metrics`, `VAULT_SYNC_STATUS_DIR=/sync-status`; no service other than `app` publishes ports.
- **Code:** `deploy/litestream/litestream.yml`; `compose.prod.yml` (images `${REGISTRY}/app|agent|sync:${ATLAS_VERSION}`, vault mounts from `/srv/atlas/vaults`, `restore`, `litestream`, `sync-naresh` with `sync-naresh-config` and `sync-status` volumes, a commented `sync-<name>` template for a second user). The litestream config is mounted read-only from `/opt/atlas/litestream.yml`.
- Local `docker compose config` for prod needs a dummy env; the test supplies one.

## 5.4 Secrets fetch and systemd unit (ADR 0078, TRD §7)
- **Tests first** — `deploy/vm/fetch-secrets.test.mjs` with fake `gcloud` / `curl` (and a `PATH` without `gcloud` for the REST path):
  - gcloud path: calls `gcloud secrets versions access latest --secret=<name>` for each of the five names; output file has exactly the five `KEY=value` lines (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AGENT_SECRET`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`) with a mode of 600 and its directory 700;
  - no-gcloud path: gets a token from the metadata server URL (fake `curl` asserts the `Metadata-Flavor: Google` header) then calls the Secret Manager REST `…/secrets/<name>/versions/latest:access`, base64-decodes the payload;
  - all-or-nothing: if the third secret fails, exit non-zero, **no** file left (written to a temp file and moved only at the end), stderr names the missing secret but never prints any value; values never appear in stdout/stderr (assert with sentinel values);
  - values containing `=`, `$`, quotes or newline-free base64 survive (Compose `--env-file` reads raw `KEY=value`; a value with a newline is rejected with an error).
  - A static test over `atlas.service` and `atlas.env.example`: `ExecStartPre` runs `fetch-secrets.sh`, `ExecStart` uses both `--env-file`s and the two `-f` files, `Type=oneshot`, `RemainAfterExit=yes`, `After=docker.service network-online.target`; the env example holds every key TRD §7 lists and no secret names. The prod compose-config check from 5.3 now also runs with the real `atlas.env.example` and a dummy secrets file.
- **Code:** `deploy/vm/fetch-secrets.sh` (env overrides for output dir and secret names list for tests), `deploy/vm/atlas.service`, `deploy/vm/atlas.env.example` (non-secret values with placeholders: `ATLAS_VERSION`, `REGISTRY`, `ADMIN_EMAIL`, `APP_ORIGINS`, `GOOGLE_CLIENT_ID`, `VAULTS_HOST_PATH`, `LITESTREAM_BUCKET`, `APP_TIME_ZONE`, `VAULT_CREATE_ENABLED=false`).
- **Verify first:** that the Secret Manager REST access URL and response shape (`payload.data` base64) match Google's current docs.

## 5.5 Bootstrap and shellcheck (ADR 0077, TRD §8.3)
- **Tests first:**
  - `scripts/shellcheck.test.mjs`: runs `shellcheck` on every `deploy/**/*.sh` and `e2e/run.sh`, `ops/docker-entrypoint.sh` (skip with a message when not installed). Starts red only once `shellcheck` is present and `bootstrap.sh` is missing/has findings.
  - `deploy/vm/bootstrap.test.mjs`: runs `bootstrap.sh` with fakes for `apt-get`, `curl`, `gpg`, `systemctl`, `swapon`, `fallocate`, `tailscale`, `gcloud`, `chown`, `id`, and `ATLAS_ROOT=<tmp>` as a path prefix: first run creates the swap line in `fstab`, Docker `daemon.json` with `json-file`/`10m`/`3`, `/opt/atlas` files (Compose files, scripts, litestream config), `/srv/atlas/vaults` (chown 1000:1000 recorded), `/etc/atlas/atlas.env` from the example, installs and enables `atlas.service`; **second run changes nothing** (fstab line once, an edited `atlas.env` is not overwritten, no duplicate apt sources); runs as non-root fail with a clear message (skippable by env for the test).
- **Code:** `deploy/vm/bootstrap.sh` (bash, root, idempotent) per TRD §8.3; it copies files from the checkout it is run from (`git clone` on the VM or `scp`ed dir). Uses a docker credential helper path if `gcloud` is absent. Verify first: Docker's current Debian apt instructions and Google's Debian image contents (is `gcloud` present, is `unattended-upgrades` on) — noted in the log.
- Root `package.json` scripts: no new script; the shellcheck test is part of `pnpm test`.

## 5.6 `release.sh` and `deploy.sh` (ADR 0077, TRD §8.6)
- **Tests first:**
  - `deploy/release.test.mjs` with fake `docker`, `git`, and a temp copy of the repo layout: refuses a dirty tree, a version that differs from root `package.json`, a missing `REGISTRY` (env or `deploy/release.env`); with `--dry-run` prints (and records) the three `docker buildx build --platform linux/amd64 … -t ${REGISTRY}/<app|agent|sync>:<version> --push` commands for `Dockerfile`, `apps/agent/Dockerfile`, `deploy/sync/Dockerfile` and pushes nothing; without dry-run the fake `docker` receives the same calls.
  - `deploy/vm/deploy.test.mjs` with fake `docker`, `systemctl`, `curl`, `sleep`: sets `ATLAS_VERSION` in a temp `atlas.env` (replace or append, other lines untouched), `--files <dir>` copies the Compose files/scripts, otherwise keeps the installed ones, runs `docker compose pull` then `systemctl restart atlas`, polls `http://127.0.0.1:3100/api/health` until 200 within 3 minutes (fake `curl` returns 503 twice then 200), prints success; on timeout exits non-zero and prints the last `docker compose ps`/logs hint; rollback = same script with the previous version (asserted by running it twice); `--dry-run` prints and changes nothing.
- **Code:** `deploy/release.sh`, `deploy/vm/deploy.sh`, `deploy/release.env.example`; `.gitignore` gains `deploy/release.env` (the only `.gitignore` edit; a test line in `compose.test.mjs`/release test asserts it is ignored via `git check-ignore`).
- No registry push is performed in this checkpoint, ever.

## 6.1 Runbook `docs/deploy.md` (TRD §8, §5.2, §10)
- **Test:** `scripts/deployDocs.test.mjs` — a docs guard (like the name guard): `docs/deploy.md` exists and has the headings listed below, every `deploy/...` path it mentions exists in git, every `gcloud` command block is under the "Naresh runs" convention (labelled), and `docs/README.md` links it. Written first, red until the doc exists.
- **Content:** GCP resources with commands and monthly prices (VM e2-small, 20 GB balanced disk, ephemeral external IP, bucket, registry) **taken from Google's list on the day I write it** (I read the public price pages; if a price can't be confirmed I mark it "check Google's list" rather than guess); bootstrap; Tailscale (§8.4); Obsidian login per user (§5.2); first deploy; deploy; rollback; secret rotation; restore (automatic and point in time); resize (§8.5); adding the second user; shutting down the old project; memory/`docker stats` check. Every command is written for Naresh to run; nothing is run by me.

## 6.2 Rewritten docs (ADR 0077, 0073)
- **Tests first:** extend `scripts/nameGuard.test.mjs`: `backups.md`, `phone-access.md`, `google-cloud-setup.md` leave the history allow-list (they must now be free of "Mnemosyne"); README/`docs/README.md`/root `CLAUDE.md` checks via the same guard; `deployDocs` test asserts `README.md` no longer mentions `whisper`, `WHISPER_`, `BACKUP_DIR`, `BACKUP_HOST_PATH` outside a "removed variables / upgrading" note, and lists the new variables (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `TRANSCRIPTION_MODEL`, `VAULT_CREATE_ENABLED`, `LITESTREAM_METRICS_URL`, `VAULT_SYNC_STATUS_DIR`).
- **Docs:** `google-cloud-setup.md` rewritten for the `atlas` project (OAuth client published *In production*, VM Tailscale origin); `phone-access.md` rewritten for the VM (`tailscale serve --bg 3100` on the VM); `backups.md` becomes a short pointer to the runbook's restore section; README (variables table, setup with `COMPOSE_FILE`, whisper-server setup and troubleshooting removed, new troubleshooting for sync/replication Status rows); root `CLAUDE.md` (hosting, `deploy/` row in the folder table, Compose files, replace the `ops/` row); `docs/README.md` (runbook link, v0.10.0 status line).
- **`ops/` (see question below):** proposed to delete `ops/com.naresh.whisper-server.plist` and `ops/README.md` (obsolete since 3.4) and keep `ops/docker-entrypoint.sh` (the app image uses it). The `.dockerignore` line `ops/*.plist` is removed with it.

## Open points I will not decide silently
1. **Deleting the whisper plist/README in `ops/`** is not in the TRD or tasks; I plan it in 6.2 as the TRD's "whisper-server is replaced" implies. Say if you'd rather keep them.
2. **`shellcheck` isn't installed** on this Mac; the shellcheck checks will skip (printed) until you `brew install shellcheck`. I will report which ran.
3. **No new dependency**: if parsing YAML needs a library not already in the repo, the Litestream test uses text assertions and `docker compose config` instead.
4. If the pinned `obsidian-headless` config directory or any Litestream key differs from the TRD, the difference goes in the log line; one that changes a decision stops me and asks (new ADR 0079).

## Verification (end of checkpoint)
- Per task: new test red → green; `pnpm test` at the root (shared, server, web unit, plus all `scripts/*.test.mjs` and `deploy/**/*.test.mjs`), `pnpm lint`, `pnpm typecheck` for anything touched (shared/server/web are only touched if a contract slip needs it; expected none).
- After 5.1 and at the end: `docker compose config`, `docker compose build`, `pnpm e2e` (7 passed).
- Local: `docker build deploy/sync`; `docker compose -f docker-compose.yml -f compose.prod.yml --env-file deploy/vm/atlas.env.example --env-file <dummy secrets> config --quiet`.
- Not run, by design: anything on GCP, Tailscale, Obsidian, the registry, a real VM (checkpoint E).
- Report: tasks with commit hashes, per-folder results, `pnpm e2e`, which vendor facts differed from the TRD, ADRs (none expected), deferred items.
