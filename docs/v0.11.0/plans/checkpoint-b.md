# Checkpoint B plan: Phase 3 (deploys), v0.11.0

## Context
Checkpoint A made migrations forward-only and tested. B makes the VM deploy safe around them (ADR 0086, TRD §3): `/api/health` reports version, schema and replication; `deploy.sh` refuses to upgrade while replication is failing or stale, reports and records each deploy, and `--restore-pre-migration` rolls back past a migration. No new ADR expected (0086 covers it). Nothing here runs against the VM; Naresh rehearses it in checkpoint D.

Facts found:
- `getHealth` ([health.controller.ts](apps/server/src/controllers/health.controller.ts)) returns `{ status: 'ok' }`; its test asserts exactly that. TRD §3.1 wants `{ ok: true, version, schema, replication }`. This is a deliberate change of that test (listed in the log).
- Replication is stored as a `health_status` row, kind `replication`, subject `default` (`health.service.ts`); `config.litestreamMetricsUrl === null` means not configured. Service check interval is `config.statusCheckIntervalMinutes` (default 2); the health response doesn't carry it, so the preflight in `deploy.sh` reads it from `/etc/atlas/atlas.env` (`STATUS_CHECK_INTERVAL_MINUTES`, default 2) — see open point 1.
- `requestLog.ts` already skips `/api/health`. `deploy.sh` waits on HTTP 200 only, so it keeps working.
- Server `build` compiles `src` only, so `preMigration.ts` goes in `apps/server/src/scripts/` (TRD §3.4) and runs as `node dist/src/scripts/preMigration.js` (TRD writes `dist/scripts/…`; the real path includes `src/`, as `start` shows — noted in the 3.4 log).
- `deploy.test.mjs` runs `deploy.sh` against a temp folder with fake `docker`/`systemctl`/`curl`/`sleep`; new deploy.sh tests extend its fakes (curl must return a body for the preflight).

## 3.1 — `/api/health` body
- Tests first: `packages/shared/src/health.test.ts` (schema accepts configured/unconfigured shapes, rejects missing `schema`); rewrite `health.routes.test.ts`: Mac case → `ok: true`, `version` equals the server `package.json` version, `schema` equals the last migration's stored version, `replication: { configured: false, failing: null, last_success_at: null, last_checked_at: null }`; with `litestreamMetricsUrl` set and a stored replication row (failing, then healthy) → the mapped fields. Red: shape missing.
- Code: `packages/shared/src/health.ts` (`HealthResponse`, exported from `index.ts`); `getHealth` builds the body through a small `health.service`-side function reading the `replication` row from `system.repository` (a non-user query, allowed there); version read once from `package.json`; schema from `PRAGMA user_version`.
- Contract note: no `user_id` queries added to user repositories.
- Commit `feat(0.11-3.1): health reports version, schema and replication`. Checks: server + shared tests, lint, typecheck.

## 3.2 — Preflight and `--force`
- Verify first: Litestream 0.5 docs (context7/docs) on whether `sync_count` grows on an idle database; record the answer in the log. Preflight uses `failing` and `last_checked_at` only unless the answer says otherwise.
- Tests first (`deploy.test.mjs`, red because there is no preflight): refuses when `failing: true`; refuses when `last_checked_at` is older than 2× the check interval; refuses when the app doesn't answer; `configured: false` passes; `--force` skips and prints why it would have stopped; `--dry-run` shows the preflight step.
- Code: `preflight()` in `deploy.sh` after argument parsing and before the pull, reading `$HEALTH_URL` with curl and parsing the JSON with the node-free approach already available on the VM (see open point 2).
- Commit `feat(0.11-3.2): deploy preflight`.

## 3.3 — Report and `deploys.log`
- Tests first: after a healthy wait, output contains `Atlas 0.11.0 is up, schema 13 → 14` (or `schema 14, unchanged`); `$DEPLOYS_LOG` (env override, default `/var/lib/atlas/deploys.log`) gains `<UTC time> <version> <schema>`; previous version and schema come from its last line, and the rollback hint prints `deploy.sh <previous>` (plus `--restore-pre-migration` when schemas differ); `bootstrap.test.mjs` asserts `/var/lib/atlas` exists root-owned.
- Code: read `schema` from the health body after the wait; append; `bootstrap.sh` `mkdir -p` and `chmod 755`.
- Commit `feat(0.11-3.3): deploy report and history`.

## 3.4 — `preMigration.ts` `find` and `swap`
- Tests first (`src/scripts/preMigration.test.ts`, temp folder): `find 13 14` returns the newest matching `pre-migration-v13-to-v14-*.db`, ignores other steps, errors when none; `swap <file>` moves `atlas.db`, `-wal`, `-shm` to `pre-migration/rolled-back-v<to>-<stamp>.db` (+suffixes), copies the file to `atlas.db`, deletes nothing, handles missing `-wal`/`-shm`, refuses a missing file and an existing rolled-back target.
- Code: pure exported functions plus a thin CLI entry (`process.argv`); database folder from `DATABASE_PATH`.
- Commit `feat(0.11-3.4): pre-migration find and swap`.

## 3.5 — `--restore-pre-migration` orchestration
- Tests first (`deploy.test.mjs`, with `--dry-run` and fakes): the flag needs a version; refuses when target schema (from `deploys.log`) equals running schema, or the target isn't in the log; refuses when `find` prints nothing, pointing at the runbook; step order is look up → find → stop unit → swap → pull/set/start/wait → report; preflight skipped; health-wait failure message names `--restore-pre-migration` when schemas differ.
- Code: extend `deploy.sh`; `find`/`swap` via `docker compose run --rm --no-deps app node dist/src/scripts/preMigration.js …`.
- Commit `feat(0.11-3.5): deploy.sh restore-pre-migration`.

## 3.6 — Runbook
- Tests first: a `deploy/` guard test that `docs/deploy.md` names `--restore-pre-migration`, `--force`, and has Upgrading and Rolling back headings (red).
- Rewrite "Deploying a release" → **Upgrading** (before / command / after; first deploy needs `--force`) and **Rolling back** (plain redeploy; `--restore-pre-migration` with the lost-writes note and the Litestream point-in-time fallback); update `CLAUDE.md` root/`deploy` description lines if the architecture text changes.
- Commit `docs(0.11-3.6): upgrading and rolling back runbook`.

## Verification (each task and the end)
Per task: tests, lint, typecheck for touched folders. At the end: root `pnpm test` (shared, server, web, deploy), agent pytest, `pnpm e2e` (Docker running), and `deploy.sh --dry-run` output for upgrade and rollback pasted in the report.

## Open points
1. Preflight staleness limit: the TRD says "twice the service-check interval" but the health body lacks the interval. Plan: read `STATUS_CHECK_INTERVAL_MINUTES` from `atlas.env`, default 2. Say if you'd rather add the interval to the body (a TRD change).
2. Parsing JSON in bash on the VM: plan is `python3 -c` if present, else a small `node` one-liner through the app image is too slow for preflight; I'll check what `bootstrap.sh` installs and use `jq` only if it's already there (installing it would be a dependency decision).
