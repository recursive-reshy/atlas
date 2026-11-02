# Checkpoint C plan — Atlas v0.10.0, phase 4 (tasks 4.1–4.5)

## Context
Checkpoint B moved transcription to OpenAI. Checkpoint C retires the Mac-era backup feature (ADR 0076, supersedes 0051) and adds the Status rows and onboarding switch the VM needs (ADRs 0050, 0074, 0075, 0063, 0065). All of it is app-side; no Compose prod, Litestream or sync container is built here (checkpoint D). Everything is optional-by-config, so the Mac behaves as before except that backups and `whisper` rows are gone.

Per task: failing tests first (watch them fail for the right reason) → least code → refactor green → tick Status + log line in `tasks.md` → commit `feat(0.10-<id>): …` → push, staging files by name. After each task run tests, lint and typecheck for every touched folder (shared, server, web; web also `test:browser` when a screen changes). End of checkpoint: also `pnpm e2e` and the report.

## Before task 4.1: save this plan
Copy it to `docs/v0.10.0/plans/checkpoint-c.md`, tick the Plan cell in `tasks.md`, commit `docs(0.10-plan): checkpoint C`, push.

## 4.1 busy_timeout, pre-migration folder, backups retired (ADRs 0066, 0076)
- **Tests first:**
  - `database.open.test.ts`: `PRAGMA busy_timeout` reads back 5000; with a file database, a pre-0.9 set-aside and a pre-migration copy land in `<dirname(path)>/pre-migration/` with no `backupDir` option; `:memory:` still makes none.
  - `config.test.ts`: `BACKUP_DIR` is in `ignoredEnv`; `config.backupDir` is gone.
  - `app.test.ts`: `POST /api/backups` is 404.
  - shared `status.test.ts`: `BackupResult` no longer exported.
- **Code:**
  - `repositories/database.ts`: `busy_timeout = 5000` right after opening, before `journal_mode`; `copyTo` takes the directory derived from `path`; `OpenOptions.backupDir` removed (keep `migrations`); error message "Restore an older backup" reworded to point at the restore runbook.
  - `server.ts`: stop passing `backupDir`; drop `recordOpenBackups`; keep the log lines for `setAside` / `preMigrationBackup`.
  - Delete `services/backup.service.ts` + test, `controllers/backups.controller.ts`, `routes/backups.routes.ts` + test, and the `app.ts` mount. `backupStamp.ts` stays (file names). Remove backup-only entries in `errors.ts` if unused.
  - `config.ts`: remove `BACKUP_DIR`/`defaultBackupDir`/`backupDir`; add `BACKUP_DIR` to `IGNORED_VARIABLES`. Also add `BACKUP_HOST_PATH` there (it is a Compose variable the server never reads, so the warning applies only if set in its own env; harmless).
  - Web: delete `api/backups.api.ts`(+test), `hooks/useRunBackup.ts`(+test), `StatusPanel/BackupControls.tsx`(+test); strip backup use from `StatusCard`, `StatusTableRow`, `StatusPanel`(+test), `statusLabels.ts`, `test-support/status.fixture.ts`.
  - Shared: remove `BackupResult`.
  - `docker-compose.yml` loses `BACKUP_DIR` and the `/backups` mount; `.env.example` and `apps/server/.env.example` lose the backup variables; `e2e/docker-compose.e2e.yml`, `e2e/run.sh` (`BACKUP_HOST_PATH`, `E2E_BACKUP_DIR`) and any e2e spec that clicks Back up now are updated (grep `e2e/tests`).
  - Docs touched in the same commit where they describe current behaviour: root, server and web `CLAUDE.md` (Backups paragraph → "replication arrives with the VM; pre-migration copies in `pre-migration/`"). `README.md`/`docs/backups.md` backup text is left for 6.2 (noted in log).
- **Red → green:** open/config/app tests fail first; typecheck then drives the deletions. Removed test files are listed in the log line.

## 4.2 Status: transcription check, whisper/backup gone (ADRs 0050, 0074)
- **Tests first:**
  - `status.service.test.ts`: the admin's rows are Agent and Transcription only (no Backups row); a member sees neither.
  - `health.repository.test.ts` / new startup test: leftover `whisper` and `backup` rows (and their `health_errors`) are deleted by the startup clean-up; rows for configured checks survive; listing never throws on them.
  - `shared/status.test.ts`: `AppHealthKind` is `agent | transcription | replication`.
  - `health.service.test.ts` already covers the transcription check (3.4); extend only if gaps.
- **Code:**
  - Shared `status.ts`: drop `whisper`/`backup`; update comments.
  - `status.service.ts`: remove `BackupDetail`, `formatBytes`, `describeBackup`, the backup subject.
  - `health.repository.ts`: add `deleteUnconfiguredHealth( configuredAppKinds, … )` (raw `DELETE … WHERE kind NOT IN (…)` on `health_status`; `health_errors` follows by FK cascade if that is how it is declared, otherwise deleted in the same transaction). It is system-level (no `userId`), so it goes through `system.repository.ts` or is added to the guard test's exception list the way the TRD allows; check which fits the existing guard.
  - Called from `server.ts` at startup with the kinds currently configured (replication when `LITESTREAM_METRICS_URL` is set; vault_sync when `VAULT_SYNC_STATUS_DIR` is set; agent and transcription always).
- **Decision to flag:** the DB `CHECK` still lists `whisper`/`backup` (migration 11 kept them, task 3.2 log). I do **not** add another migration: rows are deleted at startup, and the CHECK is only looser than the code. Say if you want a migration instead.

## 4.3 Status: replication from Litestream metrics (ADRs 0050, 0076)
- **Verify first:** read the pinned Litestream 0.5.x docs/source (context7 or litestream.io) for the metric names (sync-error counter per database, last-sync timestamp) and the `LITESTREAM_BUCKET`-independent `addr` key; record in a single commented constant `LITESTREAM_METRICS` in the new parser module and note any difference from the TRD in the log line. No GCS or cloud call is made.
- **Tests first** (fixture metrics text in `test-support/`, fake `fetch`): parser reads counters and labels from Prometheus text (comments, labels, `+Inf`, blank lines); check passes on first sample; fails when unreachable (2 s timeout), on non-200, or when the error counter for the database increased since the previous check (state kept in memory per process; first sample never fails); `detail` is `{ last_sync_at }` JSON when the gauge exists and `describeReplication` renders "Last synced …"; an old last-sync alone never fails; no row at all when `LITESTREAM_METRICS_URL` is unset; the unconfigured replication row reads `off`/absent.
- **Code:**
  - `config.ts`: optional `LITESTREAM_METRICS_URL` (URL) → `config.litestreamMetricsUrl: string | null`.
  - New `clients/litestreamMetrics.client.ts` (`fetchMetrics`, pure `parseMetrics`), and `checkReplication` in `health.service.ts`, added to `runServiceChecks` only when configured; subject `{ kind: 'replication', id: 'default' }`, name "Replication (Litestream)".
  - `status.service.ts`: replication row for the admin, only when configured; detail formatted as "Last synced <relative or ISO>"; web `statusLabels.ts` label for the kind.
- ADR numbers: none new expected.

## 4.4 Status: vault-sync rows from status files (ADRs 0050, 0065, 0075)
- **Tests first:**
  - shared: `VaultSyncStatusFile` accepts `{ state: starting|running|failed, since, heartbeat_at, last_error|null, cli_version }`, rejects bad state / non-ISO times.
  - server `vaultSync` check (temp dir of JSON files, injected clock): missing file → failing ("not found"), unparseable → failing, `failed` → failing with `last_error` as message, heartbeat older than 5 min → failing "The sync container has stopped", fresh `running` → ok with detail; only users with a `vault_dir`; no checks at all when `VAULT_SYNC_STATUS_DIR` unset; a path-traversing `vault_dir` cannot escape the dir (VaultDir regex already forbids it; assert a test).
  - `status.service.test.ts`: a member gets only their own `vault_sync` row (subject id = their `vault_dir`); the admin gets every user's rows labelled with the user's name (e.g. "Vault sync — Alex"); a user with no vault gets no row; another user's row is never returned (404 for `getHealthErrors` on someone else's subject, per ADR 0062).
  - web: `StatusPanel.test.tsx` renders the rows with and without a name.
- **Code:**
  - Shared `status.ts`: `VaultSyncStatusFile` Zod schema (the sync script in 5.3 mirrors it).
  - `config.ts`: optional `VAULT_SYNC_STATUS_DIR`.
  - `health.service.ts`: `checkVaultSync()` iterates the users with a vault via the existing user repository (`recordCheck( userId, { kind:'vault_sync', id: vaultDir }, … )`); it runs with the other timer checks (and the admin refresh) beside `checkReplication`; read-only, `readFile` of `<dir>/<vault_dir>.json`.
  - `status.service.ts`: `vaultSyncRows` for members; for the admin all users' rows with the user's name (admin sees other users' `vault_sync` rows only; `listHealth` needs an admin variant that is explicit about it, kept in the admin/system repositories to satisfy the `userId`-first guard).
  - Web: row label and name rendering in `StatusTableRow`/`StatusCard`, `statusLabels.ts`.
- Phone and desktop widths, light and dark: re-run `StatusPanel` browser tests; take screenshots for the report if a dev server can be run.

## 4.5 `VAULT_CREATE_ENABLED` (ADRs 0063, 0075)
- **Tests first:**
  - config: default `true`; `false`/`0` parse to `false`, garbage rejected.
  - `vaultOnboarding.service.test.ts`: with it off, `createVault` throws a 403-mapped error ("New vaults are set up by the admin"), makes no folder and binds nothing; with it on, behaviour unchanged; `claimVault` unaffected either way.
  - `me` route/controller test: the onboarding (vault-choices) response has `can_create` both ways.
  - shared `auth.test.ts`: `VaultChoice` has `can_create: boolean`.
  - web: `useVaultChoices` / onboarding page tests: **New vault** hidden and "If your vault isn't listed, ask the admin to set up its sync." shown when `can_create` is false; unchanged when true. Browser test if the onboarding page already has one.
- **Code:** `config.vaultCreateEnabled`; `errors.ts` gets a `ForbiddenError` if none exists (check first; the error handler must map it to 403); `createVault` guard at the top; `listUnclaimedVaults` / the controller return `can_create`; shared `VaultChoice`; the onboarding page (find under `apps/web/src/pages` or components via `useVaultChoices`); `.env.example` documents the variable.
- ADR 0063 is amended by 0075 already; no new ADR.

## Cross-cutting
- `apps/server/CLAUDE.md`, `apps/web/CLAUDE.md`, root `CLAUDE.md`: update the Backups, Status and Onboarding sentences in the task that changes them.
- New variables go in `.env.example` files with a comment; none in Compose for the Mac (unset = off).
- No new dependency. No new ADR expected; if the startup-deletion-vs-migration choice is overruled, that needs ADR 0079.

## Verification (end of checkpoint)
- `pnpm --filter @atlas/shared test lint typecheck`, same for `@atlas/server` and `@atlas/web` (plus `test:browser`), root `pnpm test` (name guard), `pnpm e2e`.
- Manual on the Mac: start the app; Settings → Sources shows Agent and Transcription only, no **Back up now**; a temp `VAULT_SYNC_STATUS_DIR` with a fresh `running` file and a stub metrics server (`LITESTREAM_METRICS_URL`) make the Replication and Vault sync rows appear ok, and a stale heartbeat makes the latter fail.
- Report: tasks with commit hashes, per-folder results, `pnpm e2e`, no ADRs expected, deferred items (README/backups.md text → 6.2).
