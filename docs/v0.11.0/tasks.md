# Tasks — Atlas v0.11.0

Built from `prd.md` and `trd.md` in this folder. Tasks run strictly in order. Each one is test-first (ADR 0007) and ends in its own commit.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done (tests green, committed, pushed) · ⏸️ Deferred
**Plan:** ⬜ Not approved · ✅ Approved (the link points to the saved plan)

## How this file works
- Work is grouped into checkpoints. Each checkpoint covers one or more phases.
- **Start of a checkpoint:** in plan mode, write one plan for every task in it (files to touch, tests to write first, expected red → green path). Then stop. When Naresh approves it, save the plan to the linked file, tick the checkpoint's Plan cell, and commit.
- **During a checkpoint:** work through its tasks without stopping. For each task:
  1. failing tests first → green → refactor;
  2. tick Status;
  3. commit (`feat(0.11-<id>): …`, `fix(0.11-<id>): …`, `refactor(0.11-<id>): …`, `chore(0.11-<id>): …`, plans as `docs(0.11-plan): checkpoint <x>`);
  4. push.
- **End of a checkpoint:** stop and report:
  - what was built;
  - test/lint/typecheck results per package, plus `test:browser` for web, the agent's tests and the `deploy/` tests;
  - `pnpm e2e`;
  - anything deferred;
  - any ADR that changes the TRD.
  Don't start the next checkpoint until Naresh says so.
- Never start a task whose checkpoint Plan cell is ⬜.
- If something isn't covered by the PRD, TRD or ADRs, stop and ask. Record the decision as the next ADR (from 0088) and add its number to the task's ADR column.
- **Verify vendor facts** where the TRD says so (Litestream 0.5, SQLite's `DROP COLUMN`/`RENAME COLUMN`): check the docs for the pinned version and note any difference in the log line.
- **No test touches the network, GCP, Gemini, Obsidian or a real vault.**
- **The VM is Naresh's.** Claude Code never runs a command against the VM, GCP or the bucket. It writes the scripts and runbook; Naresh runs them (checkpoint D) and pastes the output back.
- **Data first:** nothing resets, recreates or hand-edits the VM's database.
- Existing tests pass unchanged, except where the TRD changes them; list each changed test file in the log line.
- Add a one-line note to the log at the bottom whenever a task is ticked.

---

## Checkpoint A: Phases 1–2 (kick-off, migrations)
**Plan:** ✅ [`plans/checkpoint-a.md`](plans/checkpoint-a.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 1** | **Kick-off** | | |
| 1.1 | Version 0.11.0 in every `package.json`, `apps/agent/pyproject.toml`, the agent's `uv.lock` entry and the README status line; root `CLAUDE.md` current version 0.11.0; confirm `docs/README.md` lists v0.11.0 and ADRs 0084–0087 | | ✅ |
| **Phase 2** | **Migrations (TRD §2)** | | |
| 2.1 | Lock file and `migrations:lock` script (TRD §2.2); lock versions 10–13; hash and contiguity tests; `SCHEMA_BASE` guard test | 0085 | ✅ |
| 2.2 | `fixtures/schema-13.sql` covering every table (TRD §2.3); missing-seed and empty-table guard tests | 0085 | ✅ |
| 2.3 | `database.upgrade.test.ts` (TRD §2.4): row counts with allow-list, read-back through repositories, integrity and foreign-key checks; `migration failed` log line on a throwing migration (TRD §2.6) | 0085 | ✅ |
| 2.4 | Migration 14 (TRD §2.5), test-first against the seed; repository, adapter and services renamed to `duration_seconds`; SQLite version check noted in the log | 0085 | ✅ |
| 2.5 | `release.sh` refuses an unlocked migration, with its `node:test`; lock 14; root `CLAUDE.md` "Database changes" section (TRD §2.7) | 0084, 0085 | ✅ |

**Checkpoint A done when:** a changed locked migration, a missing seed or an unlocked release each fail with a clear message, and the schema-13 seed migrates to 14 cleanly.

---

## Checkpoint B: Phase 3 (deploys)
**Plan:** ✅ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 3** | **Health, deploy and rollback (TRD §3)** | | |
| 3.1 | `packages/shared/src/health.ts` and the new `GET /api/health` body (TRD §3.1); route tests on the Mac (`configured: false`) and with a stored replication row | 0086 | ✅ |
| 3.2 | `deploy.sh` preflight and `--force` (TRD §3.2); Litestream `sync_count` behaviour checked in the docs and noted | 0086 | ✅ |
| 3.3 | Report line and `/var/lib/atlas/deploys.log` (TRD §3.3); `bootstrap.sh` creates the folder; rollback hint from the history | 0086 | ✅ |
| 3.4 | `scripts/preMigration.ts` `find` and `swap` with unit tests in a temp folder (TRD §3.4) | 0086 | ✅ |
| 3.5 | `deploy.sh <previous> --restore-pre-migration` orchestration and refusals, `node:test` with `--dry-run`; health-wait failure message names the flag | 0086 | ⬜ |
| 3.6 | `docs/deploy.md` Upgrading and Rolling back sections (TRD §3.6); guard test that the runbook names `--restore-pre-migration` and `--force` | 0084, 0086 | ⬜ |

**Checkpoint B done when:** `deploy.sh --dry-run` shows the full upgrade and rollback sequences, and every refusal is tested.

---

## Checkpoint C: Phase 4 (dependencies)
**Plan:** ⬜ [`plans/checkpoint-c.md`](plans/checkpoint-c.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 4** | **Dependencies (TRD §4)** | | |
| 4.1 | Server, shared and e2e refresh within current majors, exact pins moved; `vitest`/`@vitest/browser-playwright` and `playwright`/`@playwright/test` together | 0087 | ⬜ |
| 4.2 | Web refresh including `@mdxeditor/editor` 4.5; manual editor check (toolbar, source toggle, dark mode, properties panel) with screenshots light and dark | 0087 | ⬜ |
| 4.3 | Agent `uv lock --upgrade` within ranges; Ruff, Pyright, pytest green | 0087 | ⬜ |
| 4.4 | Base and third-party images pinned by digest; unpinned-image guard test in `deploy/`; `knip` once more; end-of-support list for the report | 0087 | ⬜ |

**Checkpoint C done when:** everything is green on refreshed dependencies, and no image is referenced by tag alone.

---

## Checkpoint D: Phase 5 (with Naresh on the VM, release)
**Plan:** ⬜ [`plans/checkpoint-d.md`](plans/checkpoint-d.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 5** | **Rehearsal, drill, release** | | |
| 5.1 | Restore runbook rewritten (TRD §5): scratch check and new-VM procedures, with a place to record each run | 0076, 0084 | ⬜ |
| 5.2 | With Naresh: `release.sh 0.11.0`; VM rehearsal (TRD §3.5): deploy → schema 14, rollback to 0.10.0 → 13 with Replication green, deploy again → 14; outputs in the log; fixes to scripts or runbook found here | 0086 | ⬜ |
| 5.3 | With Naresh: restore drill, scratch check then throwaway VM, following only the runbook; runbook corrected and the runs recorded | 0076 | ⬜ |
| 5.4 | `docs/v1-readiness.md` (TRD §6) with the drill and rehearsal ticked; `docs/v0.11.0/release-notes.md` from TRD §8, linked from `docs/README.md` | 0084 | ⬜ |

**Checkpoint D done when:** the rehearsal and both drills have passed on the VM, and the soak period has started. Faults found during the soak are added here as tasks and fixed before 1.0.

---

## Log

- 1.1 — Version 0.11.0 in the 6 package.json files, agent pyproject.toml and uv.lock (`uv lock --check` ok), README status line and root CLAUDE.md (current version and Workflow paths now v0.11.0); docs/README.md already listed v0.11.0 and ADRs 0084–0087. Root `pnpm test`, lint and typecheck green.
- 2.1 — `migrationLock.ts` (hash, read, `lockMigrations` with `--check`), `scripts/lockMigrations.ts`, `migrations:lock` script, lock seeded with 10–13; `migrationLock.test.ts` (9 tests; editing migration 13 fails it with the ADR 0085 message, checked then reverted). Server 3204 tests, lint and typecheck green.
- 2.2 — `fixtures/schema-13.sql` (all 27 tables, both users, jobs in all 9 statuses, invented data only), `test-support/schemaAt.ts` (`schemaAt`, `loadSeed`, `seededVersions`), `fixtures.guard.test.ts` (missing seed and empty table both fail with a clear message; removing one insert was checked and reverted). Server tests, lint, typecheck green.
- 2.3 — `database.upgrade.test.ts`: per seed, row counts with an allow-list keyed by version (empty), every table read back through its repository (a completeness test fails on a table with no reader), integrity and foreign-key checks, and a failing migration leaves the file at its schema; `runMigrations` now logs `migration failed` with the stored version and error before rethrowing (server.ts already exits 1 on an open failure). Reading back caught four invalid values in my seed (feed item status, Gmail match kind, posting details, JSON-encoded settings), fixed in schema-13.sql. No existing test changed. Server 3211 tests, lint, typecheck green.
- 2.4 — Migration 14 `transcriptionRunsDuration` (DROP COLUMN pieces; RENAME COLUMN audio_seconds TO duration_seconds), written against schema-13.sql first (2 new tests in `database.upgrade.test.ts`). SQLite 3.53.4 bundled with better-sqlite3, so both statements are native (needs 3.35+); no table rebuild. Renamed in `transcriptionRuns.repository.ts`, `video.adapter.ts`, `jobs.service.ts` (admin.service.ts does not read the column; `packages/shared` `pieces` is unrelated). Changed existing tests: `transcriptionRuns.repository.test.ts`, `video.adapter.test.ts`, `runJob.test.ts`, `jobs.service.test.ts`, `admin.usage.test.ts` (column name), `database.test.ts` (column list, `toHaveLength(4)` → at least 4, "schema version 13" → current version), `database.migration.test.ts` (inserts after the full list use `duration_seconds`; the length/version assertion no longer pins 4/13). Migration 14 is not locked yet (2.5). Server 3213 tests, lint, typecheck green.
- 2.5 — `release.sh` runs `pnpm --filter @atlas/server migrations:lock --check` after the clean-tree check and refuses (dry run too) with how to lock; `release.test.mjs` gains a fake pnpm and 2 tests (changed existing file: the sandbox helper). Migration 14 locked, `fixtures/schema-14.sql` added (the seed guard went red first), root CLAUDE.md "Database changes" rule added. Correction to 2.3: importing the logger into `database.ts` made `migrations:lock` (and so `release.sh`) need the whole app environment, so `runMigrations` now throws a `MigrationError` (stored version, original error as cause) and `server.ts` logs `migration failed` with the version before exiting 1; the 2.3 test now asserts the error and the untouched file instead of a log spy. Root `pnpm test` (shared 717, server 3217, web 1610, deploy and scripts 84), agent pytest 280, lint and typecheck green in every folder.
- 3.1 — `packages/shared/src/health.ts` (`HealthResponse`, 8 tests) and `GET /api/health` now answers `{ ok, version, schema, replication }` through `healthReport.service.ts` (reuses `appVersion`, `user_version`, the stored `replication` health row; `configured: false` with null fields when `LITESTREAM_METRICS_URL` is unset; `failing` is `failing_since` set). Changed existing tests: `health.routes.test.ts` rewritten (old body `{ status: 'ok' }` gone), `app.web.test.ts` (asserts `ok: true`). Nothing else read the old body (`deploy.sh` waits on HTTP 200). Shared 725 tests, server 3223, lint and typecheck green.
- 3.2 — `deploy.sh` preflight and `--force`: reads `/api/health` before anything is pulled and stops when the app doesn't answer (the first deploy needs `--force`), replication is failing, was never checked, or its `last_checked_at` is older than 2× `STATUS_CHECK_INTERVAL_MINUTES` from `atlas.env` (default 2; the health body doesn't carry the interval); not configured passes; `--force` prints the reason and goes on; `--dry-run` lists the step without running it. The body is matched as plain text (no `jq`/`python3` dependency; bootstrap installs neither). **Litestream `sync_count` check:** the metrics reference (litestream.io/reference/metrics) only says "Number of sync operations performed" and doesn't say whether an idle database counts; context7 was over quota, so this is unproven. The preflight therefore uses `failing` and `last_checked_at` only, never the age of `last_success_at` (as ADR 0076 already does); to be seen on the VM in checkpoint D. Changed existing tests: `deploy.test.mjs` (fake `curl` serves a body without `-w`; the two health-wait counts now count `-w` calls only).
- 3.3 — `deploy.sh` prints `Atlas <version> is up, schema <before> → <after>` (or `schema <n>, unchanged`) and appends `<UTC time> <version> <schema>` to `$ATLAS_DEPLOYS_LOG` (default `/var/lib/atlas/deploys.log`) only after a healthy wait; the previous version and schema come from the log's last line, and the rollback hint adds `--restore-pre-migration` when the schema changed. Addition to the TRD wording: when there is no history yet (the VM's 0.10.0 deploy predates it), the running app's version from `atlas.env` and the schema its health body reported are recorded first, otherwise the 0.11 rehearsal's rollback (3.5) would find no schema for 0.10.0. `bootstrap.sh` creates `/var/lib/atlas` (root-owned, 755). Existing "previous version was …" lines kept. Changed existing tests: `bootstrap.test.mjs` (asserts the folder), `deploy.test.mjs` (fake `curl` serves a second body, history helpers). `deploy/` tests and shellcheck green.
- 3.4 — `apps/server/src/scripts/preMigration.ts` (`findPreMigration`, `swapPreMigration`, `runCli`; 14 tests in a temp folder): `find <from> <to>` prints the newest `pre-migration-v<from>-to-v<to>-<stamp>.db` (exit 1, nothing printed, when none; other steps, `rolled-back-*` and `pre-0.9-*` ignored); `swap <file>` moves `atlas.db`, `-wal`, `-shm` to `pre-migration/rolled-back-v<to>-<stamp>.db` (+ suffixes), copies the chosen file to `atlas.db`, deletes nothing, refuses a file that isn't a pre-migration copy in the data folder, a missing file and an existing rolled-back name, and puts the live files back if the copy fails. Reads `DATA_DIR`. Runs as `node dist/src/scripts/preMigration.js` (the TRD writes `dist/scripts/…`; the build emits `dist/src/…`, as `server.js` does). Built and run once locally (`find` with no folder exits 1). Server 3237 tests, lint, typecheck green.
