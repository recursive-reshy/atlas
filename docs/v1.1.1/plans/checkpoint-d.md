# Plan — Checkpoint D: Server structure and performance (v1.1.1, behaviour-neutral)

## Context
Follows TRD §5 (5.1–5.6). `jobs.service.ts` is 833 lines of five concerns, `SELECT_JOB` pulls transcripts into every list read, `listJobs` is an N+1, the schema is 400+ lines of SQL inside `database.ts`, and the loops poll every 1 s. Branch `release/1.1.1`; one commit per task, staged by name, pushed after each. ADRs 0099 (4.4) and 0100 (4.5) are written first in their tasks, added to `docs/README.md` and the task's ADR column; each says whether it changes the TRD (expected: no, they restate TRD 5.4/5.5).

**Baseline before 4.1:** run `pnpm --filter @atlas/server test`, `lint`, `typecheck` green and record the test count; behaviour-neutral tasks (4.1–4.5) must keep it.

## 4.1 Split `jobs.service.ts` (TRD 5.1)
- **Test first = the existing suite.** Red = import breakage after the move; green = same count. `jobs.service.test.ts` is split so each test follows its function (`jobLinking.service.test.ts`, `jobDraft.service.test.ts`, `jobRender.service.test.ts`); log line lists the split.
- Move with `git mv`-style edits, no logic changes. Landing places:
  - `jobs.service.ts` keeps: `queueJob`, `findJob`, `listJobs`, `claimNextJob`, `markStatus`, `completeAcquisition`, `completeSummary`, `failSummary`, `retrySummary`, `regenerateSummary`, `record*Run`, `failJob`, `recoverInterruptedJobs`, `deleteExpiredJobs`, `moveTo`/`assertMove`/`requireJob`/`toPublicJob` (exported for the siblings: they import `jobs.service`, never the reverse).
  - `jobLinking.service.ts`: `runLinking`, `completeLinking`, `failLinking`, `recordLinkRun`, `recordLinkSuggestions`, `listLinkSuggestions`, `acceptSuggestions`, `rejectSuggestions`, `assertPendingSuggestions`.
  - `jobDraft.service.ts`: `updateDraft`, `saveJob`, `discardJob`, `submitPastedText`.
  - `jobRender.service.ts`: `renderTranscript`, `getSource`, `findSource`.
- Importers to repoint (grep `jobs.service`): `server.ts`, `sources/adapter.ts`, `worker/{worker,runJob,linkJob,summarizeJob,sweeper}.ts`, `controllers/jobs.controller.ts`, `services/inbox.service.ts`, and the tests that import them (`lifecycle.*.test.ts`, route tests, worker tests). Any `vi.mock('…/jobs.service')` is a specifier too: grep after.
- Where TRD 5.1 and the current code disagree on a function's home (`completeLinking`/`failLinking` are in the linking file per the TRD, though the task text lists only "run, record, suggestions"), I follow the TRD; one-way import rule is enforced by a small test reading the import lines (new, cheap guard).
- Gate: server `test`, `lint`, `typecheck`. Commit `refactor: split the jobs service by concern`.

## 4.2 `SELECT_JOB` names its columns (TRD 5.2)
- **Test first** (`jobStore.repository.test.ts`): the list query's rows contain no `source_document` / `note_markdown` (assert via a `listActiveJobs` result type/`toStoredJob` output: `source_document` null even when the row has one; `note_markdown` null). Red: today the list returns both.
- `jobRows.ts`: `SELECT_JOB` lists columns explicitly without the two heavy ones; `SELECT_JOB_FULL` (or a `withBodies` variant) adds them. `JobRow` splits into list row and full row; `StoredJob` stays the full shape for the full reads, `toPublicJob` for lists gets the list shape. Repository functions that return bodies (find by id for source/review, `claimNextStoredJob`, owned-job reads the loops use) use the full select; list/active/expiry reads use the light one.
- **Risk to check while implementing:** `Job.note_markdown` is part of the public contract and the review screen reads it from `GET /jobs/:id`. `findJob` therefore uses the full select; `GET /jobs` (list) changes to `note_markdown: null`?  That is a contract-visible change, so I will first check what the web list reads. If the list response must keep `note_markdown`, I stop and ask rather than change it silently.
- Gate: server test/lint/typecheck. Commit `perf: leave transcripts out of the job list query`.

## 4.3 `listJobs` without N+1 (TRD 5.3)
- **Test first** (`jobs.service.test.ts`): seed ten jobs with runs and link runs; spy on the repository functions (`listRunsForJob`, `summarizeLinkUsage`, `findProfileById`) and assert the list makes one summary-usage call and one link-usage call, and `findProfileById` at most once per distinct profile; output deep-equals the current per-job output. Red: ten calls each.
- New repository functions `listRunsForJobs(userId, ids)` and `summarizeLinkUsageForJobs(userId, ids)` using `WHERE job_id IN (…)` (via `marks()` from `jobRows.ts`, bound params); `toSummaryUsage` / `toPublicJob` take pre-fetched data; `findJob` keeps the single-job path through the same mapper. `defaultFolderFor` memoised per profile inside one `listJobs` call.
- Gate as above. Commit `perf: list jobs with one query per kind of usage`.

## 4.4 SQL out of `database.ts` (TRD 5.4, ADR 0099 first)
- **ADR 0099 first** (layout of `repositories/sql/`, naming, load at module load, hashing the same string, build copies the files).
- **Test first:** `database.sqlFiles.test.ts`: every entry in `migrations` is `{ name, sql }`; each `sql/<file>` exists; for every locked version the `migrationHash` equals `migrations.lock.json` (already covered by existing lock tests, which must pass unchanged); no orphan file in `sql/`. Red: files don't exist.
- Extraction is scripted once in the scratchpad (not committed): write each template string verbatim to `sql/baseline.sql`, `sql/10-transcription-runs.sql`, … `sql/16-themis-and-time.sql` (7 SQL migrations; none is a function today, and the grep found no backslashes or `${}` in the SQL bodies, so bytes are exact). Verify with `pnpm … migrations:lock --check` and the hash test *before* deleting the strings.
- `database.ts` reads them with `readFileSync(new URL('./sql/…', import.meta.url))`. `Migration` type stays `string | function` for `runMigrations`, so `migrationLock.ts`, `lockMigrations.ts`, `release.sh` and `database.upgrade.test.ts` stay unchanged.
- **Decision needed — build copies:** `tsc` does not copy `.sql` into `dist/`, so the production image would fail at startup. Smallest fix: `apps/server/package.json` `build` becomes `tsc --build tsconfig.build.json && node scripts/copySql.mjs` (or `cp -R`), no new dependency. This touches the build script; TRD 5.4 doesn't mention it, so I'll record it in ADR 0099. Verified by running `pnpm --filter @atlas/server build` and starting `node dist/src/server.js` against a temp `DATA_DIR`, plus `docker build` if Docker is available.
- Update `apps/server/CLAUDE.md` / `docs/architecture.md` where they say migrations live in `database.ts`. Commit `refactor: keep the schema SQL in files`.

## 4.5 Event-driven loops (TRD 5.5, ADR 0100 first)
- **ADR 0100 first** (emitter, 15 s safety poll, flag for wakes during a pass).
- **Tests first (fake timers)** in `worker.test.ts` and `meleteGenerator.test.ts`: (a) after `startWorker()` idle, `queueJob` then `await vi.advanceTimersByTimeAsync(0)` starts the job without advancing 1 s; (b) a job queued through a path that doesn't wake (repository insert directly) is found when the clock advances 15 s; (c) a wake during a running pass runs exactly one more pass; (d) the returned stop function clears the timer, ignores later wakes, and awaits the current pass; (e) generator: enrol / regenerate / approve syllabus / request draft wake it. Red: nothing wakes, poll is 1 s.
- `worker/wake.ts`: tiny emitter (`node:events`, no dependency): `wakeWorker()`, `wakeGenerator()`, `onWorkerWake(fn)` / `onGeneratorWake(fn)` returning an unsubscribe.
- Callers: after the transaction in `queueJob`, `retrySummary`, `regenerateSummary`, `runLinking`, `submitPastedText` → `wakeWorker()`; Melete enrol (scan/confirm), `regenerateNote`, `approveSyllabus`, request draft → `wakeGenerator()`. Services import `worker/wake.ts` (a leaf module, no cycle).
- `startWorker` / `startMeleteGenerator`: pass on wake + every 15 s; `pending` flag re-runs one pass; restart recovery (`recoverInterruptedJobs`, `requeueGenerating/Mapping`) untouched. Update `apps/server/CLAUDE.md`/`architecture.md` polling description.
- Commit `feat: wake the worker and the Melete generator when work is queued` (behaviour: faster start; no contract change).

## 4.6 Readable contract drift (TRD 5.6)
- **Test first** (`apps/web/src/lib/request.test.ts`): a response failing its schema throws `ApiError` whose message is `Unexpected response from the server: <path>: <message>` for the first Zod issue (nested path joined with `.`); status/code unchanged. Red: message has no detail.
- `request.ts`: build the suffix from `error.issues[0]`. Gate: web `test`, `test:browser`, `lint`, `typecheck`. Commit `fix: say which field failed when a response drifts from its contract`.

## Open points (defaults unless you say otherwise)
1. 4.2 may change what `GET /jobs` returns if the list currently includes `note_markdown`; I'll check first and stop if so (behaviour-neutral rule).
2. 4.4 build step for `.sql` files (above) is outside the TRD's literal text; ADR 0099 records it.
3. `completeLinking`/`failLinking` placed per the TRD (linking file).

## Verification and end-of-checkpoint
Per task: server (or web for 4.6) `test`, `lint`, `typecheck`, counts unchanged. At the end: root `pnpm test` (doc guards), `pnpm --filter @atlas/server build` + start from `dist`, `pnpm e2e` (Docker needed; TRD §7 requires it at D), a manual run of `pnpm dev` checking the Status panel and job list and that a newly queued job starts immediately. Report: hashes per task, results per folder, e2e, ADRs 0099/0100 (and whether they change the TRD), anything deferred.

## After approval
Save to `docs/v1.1.1/plans/checkpoint-d.md`, tick checkpoint D's Plan cell with the link, commit `docs: plan checkpoint D`, push, start 4.1.
