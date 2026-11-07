# Atlas v0.11.0 — Technical Requirements

Built from `prd.md` in this folder. Decided with Naresh on 2026-11-07; ADRs 0084–0087.

## 1. Changes at a glance
| Area | Change | ADR |
| --- | --- | --- |
| Promise | From 1.0: no database resets, forward-only migrations, rollback by pre-migration copy | 0084 |
| Migrations | Schema 13 (the VM's) is the 1.0 baseline as it stands; released migrations locked by hash; seed fixture per released schema; upgrade tests; migration 14 | 0085 |
| Deploys | `deploy.sh` checks replication first, reports version and schema, keeps a deploy history, and rolls back past a migration with `--restore-pre-migration` | 0086 |
| Health | `GET /api/health` returns version, schema and replication state | 0086 |
| Dependencies | Minor and patch refresh; base images pinned by digest; majors deferred | 0087 |
| Restore | Restore runbook; drill to a scratch path, then to a throwaway VM | 0076 |

No feature, UI or contract change for users.

## 2. Migrations (ADR 0085)

### 2.1 Baseline
- The migration list stays as it is: migrations 1–4, stored as schema 10–13 (`SCHEMA_BASE = 9`). Schema 13 is the 1.0 baseline. The VM's database is at 13, so nothing is reset or stamped.
- The pre-0.9 set-aside path (ADR 0066, stored schema 1–9) stays for those databases only. A test fails if `SCHEMA_BASE` changes.

### 2.2 Lock file (`apps/server/src/repositories/migrations.lock.json`, new)
- Maps each released stored version to the SHA-256 of its migration: the SQL string, or `Function.prototype.toString()` for a function migration. Seeded with versions 10–13.
- `pnpm --filter @atlas/server migrations:lock` (new script, `scripts/lockMigrations.ts`) adds an entry for every migration not yet locked, and never rewrites an existing one.
- **Tests:**
  - every locked entry matches its migration's hash, and the message names the version and says released migrations can't change;
  - locked versions are a contiguous prefix of the list (no gaps, nothing locked beyond the list).
- **Release:** `deploy/release.sh` refuses to build when a migration is unlocked, and says to run `migrations:lock` and commit. So every migration that reaches the VM is locked.

### 2.3 Seed fixtures (`apps/server/src/repositories/fixtures/schema-<N>.sql`, new)
- One file per locked version from 13, holding plain `INSERT`s only. `schema-13.sql` covers every table with at least:
  - two users (admin and member);
  - jobs in every lifecycle status;
  - a summary attempt and a transcription run;
  - prompt profiles of each purpose;
  - a feed and an inbox item;
  - the Gmail connection and a source;
  - a link run with suggestions;
  - Melete notes, cards, reviews and runs;
  - sessions;
  - app and user settings;
  - health rows and errors.
- **Guards:**
  - a test fails if a locked version ≥ 13 has no seed file;
  - a test fails if any table of that schema has no row in its seed (read from `sqlite_master` after loading).
- Seeds contain no real data: invented emails, URLs and text only.

### 2.4 Upgrade tests (`database.upgrade.test.ts`, new)
For each seed N:
1. Open an in-memory database and run migrations up to stored version N.
2. Load `schema-N.sql`.
3. Run the remaining migrations.
4. Assert:
   - row counts per table are unchanged, except where a migration documents a change (an allow-list in the test, keyed by version);
   - every row reads back through its repository function without a Zod error;
   - `PRAGMA integrity_check` returns `ok` and `PRAGMA foreign_key_check` returns nothing.

The PRD's "migrated matches fresh" check is replaced by these: a fresh database is built by the same migrations, so comparing the two would test nothing.

### 2.5 Migration 14 (stored schema 14)
- `transcription_runs`: drop `pieces` (always 1 since ADR 0081), rename `audio_seconds` → `duration_seconds`. Update `transcriptionRuns.repository.ts`, `video.adapter.ts`, `jobs.service.ts`, `admin.service.ts` and their tests.
- Written test-first against `schema-13.sql`. It's the first migration under the new rules and the one the VM rehearsal runs (§3.5).
- Check the SQLite version bundled with `better-sqlite3` supports `DROP COLUMN` and `RENAME COLUMN` (3.35+). If it doesn't, rebuild the table.

### 2.6 Failure
- Already true and now tested: a migration that throws rolls back the whole transaction, `user_version` is unchanged, and the server exits non-zero.
- New: before exiting, the server logs `migration failed` with the stored version and the error.

### 2.7 The rule in `CLAUDE.md`
A root `CLAUDE.md` section "Database changes", under "Rules that span apps":
- a schema change is a new migration appended to the list;
- never edit, reorder or remove a locked migration;
- each new migration needs:
  - a seed for the schema it starts from;
  - a test against that seed;
  - an allow-list entry if it changes row counts;
- never reset or hand-edit the VM's database.

## 3. Deploys (ADR 0086)

### 3.1 `GET /api/health`
Still unauthenticated and still skipped by the request log. Published only on `127.0.0.1`. The body becomes:
```json
{ "ok": true, "version": "0.11.0", "schema": 14,
  "replication": { "configured": true, "failing": false, "last_success_at": "…", "last_checked_at": "…" } }
```
- `replication` comes from the stored `replication` health row. `configured: false` (other fields null) when `LITESTREAM_METRICS_URL` is unset, as on the Mac.
- `version` comes from the server's `package.json`.
- Shape in `packages/shared/src/health.ts` (Zod).
- `ok` is unchanged: true when the app is up.

### 3.2 Preflight (before pulling)
`deploy.sh` reads `/api/health` and refuses to continue when:
- replication is configured and `failing`;
- or `last_checked_at` is older than twice the service-check interval;
- or the app doesn't answer.

`--force` skips the preflight and prints why it would have stopped. The first deploy (no app running) needs `--force`, and the runbook says so.

**Verify** against Litestream 0.5 and note in the log: does `sync_count` grow when nothing is written? If it doesn't, an idle database never updates `last_success_at`, so the preflight uses `failing` and `last_checked_at` only, never the age of `last_success_at`.

### 3.3 Report and history
After the health wait, `deploy.sh`:
- prints `Atlas <version> is up, schema <before> → <after>` (or `schema <n>, unchanged`);
- appends `<UTC time> <version> <schema>` to `/var/lib/atlas/deploys.log` (created by `bootstrap.sh`, root-owned).

The previous version and its schema are read from the last line, and the rollback hint uses them.

### 3.4 Rollback: `deploy.sh <previous> --restore-pre-migration`
1. **Look up.** Read the target's schema from `deploys.log`. If the target's schema equals the running schema, refuse: no migration to undo, plain `deploy.sh <previous>` is enough.
2. **Find the copy** with `docker compose run --rm --no-deps app node dist/scripts/preMigration.js find <from> <to>`: the newest `pre-migration-v<from>-to-v<to>-*.db` in the data volume. Refuse if there is none, and point at the runbook's Litestream point-in-time restore.
3. **Stop** the `atlas` unit (all containers, Litestream included).
4. **Swap** with `preMigration.js swap <file>`:
   - move `atlas.db`, `-wal` and `-shm` to `pre-migration/rolled-back-v<to>-<stamp>.db` (+ suffixes);
   - copy the chosen file to `atlas.db`;
   - nothing is deleted.
5. **Deploy** `<previous>` as usual (pull, set version, start, wait), skipping the preflight because the app is stopped. Report and append to the history.

`preMigration.ts` (new, `apps/server/src/scripts/`) is plain TypeScript with unit tests against a temp folder. `deploy.sh` only orchestrates, and its `node:test` file covers flag parsing, the refusals and the step order with `--dry-run`.

The previous version refusing a newer schema is already the server's behaviour. A plain `deploy.sh <previous>` across a migration therefore fails the health wait, and the failure message now names `--restore-pre-migration`.

**Litestream after the swap:** expected to start a new generation from the restored file. Proven in the rehearsal (§3.5): after the rollback the Replication row goes green within one check, and a scratch restore (§5) returns schema 13.

### 3.5 VM rehearsal (Naresh, checkpoint D)
1. Deploy 0.11.0 → schema 14.
2. Roll back to 0.10.0 with `--restore-pre-migration` → schema 13; check data and Replication.
3. Deploy 0.11.0 again → schema 14.

Each step's output is pasted into the log.

### 3.6 Runbook (`docs/deploy.md`)
- "Deploying a release" becomes **Upgrading**:
  - **before:** Status all green, nothing mid-job you care about;
  - the command;
  - **after:** version and schema printed, Status green, one job through.
- "Rolling back" covers both cases: a plain redeploy, and `--restore-pre-migration` with the lost-writes note.

## 4. Dependencies (ADR 0087)
- **Refresh within the current majors**, from `pnpm -r outdated` on 2026-11-07:
  - `google-auth-library`, `react-router`, `turndown`, `typescript-eslint`, `vite`, `@mdxeditor/editor` 4.5, `@mui/x-tree-view`, `@tanstack/react-query`, `@vitejs/plugin-react`, `eslint`, `linkedom`;
  - `vitest` + `@vitest/browser-playwright` 5.1 together;
  - `playwright` + `@playwright/test` 1.65 together;
  - agent: `anthropic`, `fastapi`, `pytest`, `ruff` via `uv lock --upgrade`.
- **Exact pins** move to the new exact version (`turndown`, `linkedom`, `google-auth-library`, `playwright`, `@vitest/browser-playwright`, `feedsmith`, `@googleapis/gmail`, `@mozilla/readability`, `@types/turndown`).
- **Deferred majors:** `typescript` 7, `ts-fsrs` 6, `@anthropic-ai/sdk` 1.x, `jsdom` 31. `@types/node` stays on 24.x to match the runtime.
- **Base images:** `node:24-slim`, `python:3.14-slim` and every other `FROM` and Compose `image:` that isn't ours (Litestream included) are pinned as `tag@sha256:…`. A `deploy/` test fails on an unpinned `FROM` or third-party `image:`.
- **Checks:** `pnpm dlx knip` once more. For the agent, unused dependencies are checked by hand against imports (no new tool). The checkpoint report lists any dependency or runtime whose support ends before 2027-07.
- **Manual check after the MDXEditor bump:** toolbar, source toggle, dark mode, properties panel.

## 5. Restore (ADR 0076, runbook only)
`docs/deploy.md` "Restoring the database" becomes two procedures:
1. **Scratch check** (any time, production untouched): on the VM, `docker run` the pinned Litestream image as the VM's service account with `litestream restore -o /tmp/atlas-restore.db gs://<bucket>/atlas.db`. Then open the copy with the app image's `node` and print the schema and row counts per table.
2. **New VM** (the disaster case):
   - create a VM and run `bootstrap.sh`;
   - secrets come from Secret Manager as at startup;
   - the `restore` service fills the empty volume from the bucket;
   - the Obsidian Sync logins are redone per user;
   - deploy the running version;
   - check sign-in, a job and a Melete review;
   - delete the VM.

Each records in the runbook: date, how long it took, and the restore point compared with the last write.

A restore loses at most the last `sync-interval` (1 s) plus whatever hadn't reached the bucket, so the runbook says "seconds to a minute".

## 6. The stability ADR and the 1.0 checklist
- **ADR 0084** is the promise (PRD §6.6).
- `docs/v1-readiness.md` (new) is the checklist:
  - [ ] the restore drill passed (both procedures);
  - [ ] the VM rehearsal passed (§3.5);
  - [ ] one to two weeks of normal use since the 0.11 deploy, with no reset;
  - [ ] all Status rows green;
  - [ ] no open fault in `tasks.md`.
- 1.0 is tagged by ticking it, then `release.sh 1.0.0` and `deploy.sh 1.0.0` (no migration).

## 7. Testing
- Every new script and test runs in the existing suites: server Vitest, `deploy/` `node:test` via root `pnpm test`.
- No test touches the network, GCP, Gemini, Obsidian or a real vault.
- `pnpm e2e` passes at the end of every checkpoint.

## 8. Release notes outline
- Migrations are locked and upgrade-tested.
- Migration 14 (`duration_seconds`).
- `/api/health` fields.
- `deploy.sh` preflight, report, history and `--restore-pre-migration`.
- Restore runbook.
- Dependency refresh and pinned images.
- The 1.0 promise (ADR 0084).
