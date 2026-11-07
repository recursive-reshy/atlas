# Checkpoint A plan: Phases 1–2 (kick-off, migrations), v0.11.0

## Context
0.11.0 is the last release that may reset the database, and it doesn't. Checkpoint A makes the promise of ADRs 0084/0085 testable: released migrations (stored schema 10–13) are locked by hash, each has a seed fixture, upgrades are tested from the seed, and migration 14 (`transcription_runs` cleanup) is the first migration written under the new rules. ADRs 0084–0087 already exist; no new ADR is expected.

Facts found while exploring:
- `database.ts`: `SCHEMA_BASE = 9`, `migrations: Migration[]` (4 string migrations: `baseline`, `transcriptionRuns`, `potProviderKind`, `geminiTranscription`), `runMigrations`, `openDatabase` (writes `pre-migration-v<from>-to-v<to>-*.db`). Bundled SQLite is 3.53.4, so `DROP COLUMN` / `RENAME COLUMN` are supported (3.35+).
- `audio_seconds` / `pieces` appear in: `transcriptionRuns.repository.ts` (+test), `video.adapter.ts` (+test), `jobs.service.ts` (+test), `runJob.test.ts`, `admin.usage.test.ts`, `database.test.ts`, `database.migration.test.ts`. `packages/shared/src/paragraphs.ts` also matched `pieces`; to be checked at 2.4 (probably unrelated). TRD names `admin.service.ts` too; at 2.4 I'll grep and rename wherever the column is actually read.
- Existing server scripts live in `apps/server/scripts/` (not `src/`); `lockMigrations.ts` goes there. Note TRD §3.4's `src/scripts/preMigration.ts` is checkpoint B, not now.
- `deploy/release.test.mjs` runs `release.sh` in a temp git repo with a fake `docker` on PATH; the 2.5 test follows that pattern.
- Version 0.10.0 appears in: root, `apps/server`, `apps/web`, `apps/agent` (`package.json` + `pyproject.toml`), `packages/shared`, `e2e` package.json files, `apps/agent/uv.lock` (`atlas-agent`), README status line (line 277 "Version 0.10.0.") and root `CLAUDE.md` line 27 (current version). The README's historical 0.10.0 mentions stay. `docs/README.md` already lists v0.11.0 and ADRs 0084–0087 (confirm only).

## Task 1.1 — Version 0.11.0
- Tests first: none exist for versions; add none (pure metadata). Verify instead with a grep afterwards.
- Edit the version in the 7 `package.json` files, `apps/agent/pyproject.toml`, the `atlas-agent` entry in `apps/agent/uv.lock` (hand-edit the one line; check `uv lock --check` still passes), README status line, root `CLAUDE.md` current version (and its `docs/v0.10.0/...` references in the Workflow section → `v0.11.0`). Confirm `docs/README.md`.
- Check: `pnpm test`, `grep -rn '0\.10\.0'` leaves only historical mentions.
- Commit: `chore(0.11-1.1): version 0.11.0`.

## Task 2.1 — Lock file and `migrations:lock`
- New: `apps/server/src/repositories/migrations.lock.json`, `apps/server/scripts/lockMigrations.ts`, script `"migrations:lock": "tsx --conditions=development scripts/lockMigrations.ts"` in `apps/server/package.json`, and a small pure helper `migrationHash( migration )` (SHA-256 of the string, or `fn.toString()`), plus `lockedMigrations( lock, list )`, in `apps/server/src/repositories/migrationLock.ts` so the script and tests share it.
- Tests first (`migrationLock.test.ts`), red because the helper and file don't exist:
  1. every entry in the lock equals the hash of its migration; message names the version and says "released migrations can't change";
  2. locked versions are a contiguous prefix starting at `SCHEMA_BASE + 1`, none beyond the list;
  3. `SCHEMA_BASE` is 9 (guard; message says changing it needs an ADR);
  4. the helper adds only missing entries and never rewrites an existing one (temp file, tampered entry stays tampered); `--check` mode exits non-zero listing unlocked versions (used by 2.5).
- Green: write helper and script, generate the lock for versions 10–13 by running `pnpm --filter @atlas/server migrations:lock`.
- Also run: tamper with a migration string temporarily and watch test 1 fail (then revert).
- Commit: `feat(0.11-2.1): lock released migrations by hash`.

## Task 2.2 — `fixtures/schema-13.sql`
- New: `apps/server/src/repositories/fixtures/schema-13.sql` (plain `INSERT`s, invented data) covering all 33 tables per TRD §2.3 (2 users, jobs in every status from `lifecycle.ts`, summary run, transcription run, profiles of each purpose, feed + inbox item, Gmail connection + source, link run + suggestions, Melete notes/cards/reviews/runs, sessions, app and user settings, health rows and errors, plus `eligible_users`/`usage_events` are views and don't need rows).
- Test helper `buildSchema( version )` in `apps/server/src/test-support/` runs the locked migrations up to a stored version on an in-memory database.
- Tests first (`fixtures.guard.test.ts`), red because no seed exists:
  1. for every locked version ≥ 13 a seed file exists (message names the missing file);
  2. after loading seed N into schema N, every table in `sqlite_master` (type table, excluding `sqlite_*`) has ≥ 1 row, naming the empty table;
  3. the seed loads with foreign keys on (`PRAGMA foreign_key_check` clean).
- Green: write the seed iteratively, driven by test 2 listing empty tables; derive columns from the migration SQL.
- Commit: `feat(0.11-2.2): schema 13 seed fixture`.

## Task 2.3 — Upgrade test and `migration failed` log
- Tests first, in `apps/server/src/repositories/database.upgrade.test.ts`: for each seed N: build schema N, load seed, run remaining migrations (`runMigrations`), assert (a) row counts per table unchanged except an allow-list keyed by version (empty for now), (b) rows read back through repository functions without Zod error (a table → reader map covering the repositories; a test asserts every table has a reader or an explicit "covered by X" entry so new tables can't be skipped), (c) `integrity_check` is `ok`, `foreign_key_check` empty. Red→green note: with no migration after 13 yet, the test passes immediately for (a)–(c); to see red I'll first run it expecting the reader-map completeness test to fail, then fill the map. The meaningful red comes in 2.4.
- Failure logging (TRD §2.6): test in `database.open.test.ts` with a throwing migration: `openDatabase` rejects, `user_version` unchanged, and a `migration failed` log line with the stored version and error message is emitted (logger injected or spied following the existing logger pattern in `apps/server/src`). Red: no log yet. Green: catch in `runMigrations` (log `{ version, err }` then rethrow); startup in `server.ts` already exits non-zero (verify and add a test if not covered).
- Commit: `feat(0.11-2.3): upgrade tests and migration failed log`.

## Task 2.4 — Migration 14
- Tests first (red): in `database.upgrade.test.ts` add to the allow-list nothing (counts unchanged) and add a migration-14 test: after migrating the seed, `transcription_runs` has `duration_seconds` and no `pieces`/`audio_seconds`, and values equal the seed's former `audio_seconds`. Update `transcriptionRuns.repository.test.ts`, `video.adapter.test.ts`, `jobs.service.test.ts`, `runJob.test.ts`, `admin.usage.test.ts`, `database.test.ts`, `database.migration.test.ts` to the new column names (list each changed file in the log line).
- Green: append migration 14 to `migrations` (`ALTER TABLE ... DROP COLUMN pieces; ALTER TABLE ... RENAME COLUMN audio_seconds TO duration_seconds`; if `pieces` sits in an index/CHECK, rebuild the table instead). Rename in `transcriptionRuns.repository.ts`, `video.adapter.ts`, `jobs.service.ts`, `admin.service.ts` (wherever present) and any shared schema field.
- Note SQLite 3.53.4 (≥ 3.35) in the log line.
- Also: run `pnpm lock` for 14? No, locking 14 is 2.5. Until then the lock test must tolerate an unlocked tail (contiguity test only requires locked ⊆ prefix).
- Commit: `feat(0.11-2.4): migration 14, duration_seconds`.

## Task 2.5 — Release guard, lock 14, `CLAUDE.md`
- Tests first (`deploy/release.test.mjs`, red): a release with an unlocked migration is refused with a message to run `migrations:lock` and commit; a locked one proceeds. Implemented by `release.sh` calling `pnpm --filter @atlas/server migrations:lock --check` (a fake `pnpm` on PATH in the sandbox; existing release tests get a passing fake). Run before the build, after the version/clean-tree checks, skipped never (not even under `--dry-run`, which should show the same refusal).
- Green: add the check to `release.sh`; run `migrations:lock` to add 14; commit the lock. The TRD's guard ("a locked version ≥ 13 has no seed" fails) demands a seed for every locked version, so locking 14 also adds `fixtures/schema-14.sql` (schema 13's data in 14's column names).
- Root `CLAUDE.md`: add "Database changes" under "Rules that span apps" (TRD §2.7), and update the Architecture paragraph mentions (migration lock, `/api/health` stays for B).
- Commit: `feat(0.11-2.5): release refuses unlocked migrations, database rules`.

## Verification (end of checkpoint)
- Per task: server `pnpm --filter @atlas/server test`, `lint`, `typecheck`; `deploy/` tests via root `pnpm test`; web/shared/agent only for 1.1 (their version bump): `pnpm test`, agent tests.
- Checkpoint done-when demos: edit a locked migration → lock test fails with a clear message; delete `schema-13.sql` → guard fails; add an unlocked migration → `release.sh` refuses; seed 13 migrates to 14 cleanly.
- `pnpm e2e` is only required from checkpoint F on, so not here.
- Report: tasks with hashes, results per folder, ADRs (none written), deferred items.
