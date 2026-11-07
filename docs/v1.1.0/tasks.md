# Tasks — Atlas v1.1.0

Built from `prd.md` and `trd.md` in this folder. Tasks run strictly in order. Each one is test-first (ADR 0007) and ends in its own commit.

**Branch:** `release/1.1.0`. Never commit to `main`, never merge, never tag.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done (tests green, committed, pushed) · ⏸️ Deferred
**Plan:** ⬜ Not approved · ✅ Approved (the link points to the saved plan)

## How this file works
- Work is grouped into checkpoints. Each checkpoint covers one or more phases.
- **Start of a checkpoint:** in plan mode, write one plan for every task in it (files to touch, tests to write first, expected red → green path). Then stop. When Naresh approves it, save the plan to the linked file, tick the checkpoint's Plan cell, and commit.
- **During a checkpoint:** work through its tasks without stopping. For each task:
  1. failing tests first → green → refactor;
  2. tick Status;
  3. commit (`feat(1.1-<id>): …`, `fix(1.1-<id>): …`, `refactor(1.1-<id>): …`, `chore(1.1-<id>): …`, plans as `docs(1.1-plan): checkpoint <x>`);
  4. push to `release/1.1.0`.
- **End of a checkpoint:** stop and report:
  - what was built, with commit hashes;
  - test/lint/typecheck results per package, plus `test:browser` for web, the agent's tests and the `deploy/` tests;
  - `pnpm e2e`;
  - anything deferred;
  - any ADR that changes the TRD.
  Don't start the next checkpoint until Naresh says so.
- Never start a task whose checkpoint Plan cell is ⬜.
- If something isn't covered by the PRD, TRD or ADRs, stop and ask. Record the decision as the next ADR (from 0094) and add its number to the task's ADR column.
- **Data first (ADRs 0084, 0085):** each migration is written test-first against the seed of the schema it starts from; nothing resets or hand-edits the VM's database. Migrations 15 and 16 are locked only in task 9.3.
- **No test touches the network, Claude, Gemini, Obsidian or a real vault.**
- **Logs:** IDs and paths only, never note text, concept, goal or area names, or check-in notes (ADR 0049).
- **The VM is Naresh's.** Claude Code never runs a command against the VM, GCP or the bucket.
- Existing tests pass unchanged, except where the TRD changes them; list each changed test file in the log line.
- Update `docs/architecture.md` and the app `CLAUDE.md` files in the same commit as the part they describe.
- Add a one-line note to the log at the bottom whenever a task is ticked.

---

## Checkpoint A: Phases 1–3 (kick-off, Melete data, syllabus)
**Plan:** ✅ [`plans/checkpoint-a.md`](plans/checkpoint-a.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 1** | **Kick-off** | | |
| 1.1 | Version 1.1.0 in every `package.json`, `apps/agent/pyproject.toml`, the agent's `uv.lock` entry and the README status line; root `CLAUDE.md` current version 1.1.0 and Workflow paths `docs/v1.1.0`; confirm `docs/README.md` lists v1.1.0 and ADRs 0089–0093 | | ✅ |
| **Phase 2** | **Melete data (TRD §2.1)** | | |
| 2.1 | Migration 15 test-first against `schema-14.sql` (upgrade test: subjects read back `none`, notes `idle`); not locked | 0085, 0089, 0094 | ✅ |
| 2.2 | Repositories: sections, concepts, note concepts; subject, note and question records gain the new columns; `MeleteRunKind` widened; shared `MeleteSubject` and new syllabus schemas | 0089 | ✅ |
| **Phase 3** | **Syllabus (TRD §3, §4.4–4.5)** | | |
| 3.1 | Prompt purposes `melete_syllabus`, `melete_map`, `melete_suggest` with locked instructions and default guidance, seeded and shown in Settings → Prompts; model settings `melete_syllabus_model`, `melete_map_model`, `melete_suggest_model` in Settings → Models | 0089 | ⬜ |
| 3.2 | `PATCH` subject `target_level`/`intent`; Draft syllabus call and processing (dedupe, 80 cap, empty sections) as pure functions; loop takes drafts first; failure keeps the old syllabus; `syllabus` run recorded | 0089 | ⬜ |
| 3.3 | `GET`/`PUT` syllabus with the diff (rename, add, remove, move) and its counts; `approve` queues every enrolled note for Map | 0089 | ⬜ |
| 3.4 | Web: subject view as tabs (Overview placeholder, Syllabus, Notes, Settings); syllabus setup (level, intent), drafting state, editor (sections, concepts, reorder, add, remove), Approve, Redraft; `test:browser` for reordering | 0089 | ⬜ |

**Checkpoint A done when:** a subject can be given a level, get a drafted syllabus, be edited and approved, and the upgrade test from schema 14 passes.

---

## Checkpoint B: Phases 4–5 (mapping, numbers and suggestions)
**Plan:** ⬜ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 4** | **Mapping (TRD §4)** | | |
| 4.1 | Generate extended for approved subjects: concept refs, note concepts, question labels, off-syllabus with suggestion; ref mapping and fallback label as pure functions; unapproved subjects unchanged | 0089 | ⬜ |
| 4.2 | Map call (full and labels-only) in the loop after generation; never touches questions' FSRS state (test asserts it); `map` run recorded; `mapping` failure and retry; interrupted mapping and drafting requeued on startup | 0089 | ⬜ |
| 4.3 | Remap triggers (TRD §4.3) on `PUT` syllabus, approve, redraft, `POST …/syllabus/remap`; pinned notes skipped | 0089 | ⬜ |
| 4.4 | `PUT /notes/:id/concepts` (hand, pinned, labels-only Map); off-syllabus `dismiss` and `add_concept`; web: concepts and flags in the Notes tab, mapping editor on the note page | 0089 | ⬜ |
| **Phase 5** | **Numbers, gaps, suggestions, landing (TRD §5)** | | |
| 5.1 | `melete/mastery.ts`: coverage, question score, concept mastery, buckets, section and subject roll-ups; `melete_mastery_days` setting; table tests | 0090 | ⬜ |
| 5.2 | `GET …/gaps` with `next_step`; `review/next?concept=` | 0090 | ⬜ |
| 5.3 | Suggest resources call: no URLs (server strips `http`), not stored, `suggest` run; web Overview tab: gap view by section, next step, Review, Suggest resources with search links | 0093 | ⬜ |
| 5.4 | `GET /melete/today` per-subject fields (seconds this week returns 0 until 7.1); `MeleteToday` as subject cards with Review all due | 0090 | ⬜ |

**Checkpoint B done when:** an approved subject's notes are mapped, coverage and mastery show on its card, the gap view gives a next step, and suggestions show without links.

---

## Checkpoint C: Phases 6–7 (Themis data and API, time)
**Plan:** ⬜ [`plans/checkpoint-c.md`](plans/checkpoint-c.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 6** | **Themis data and API (TRD §2.2, §6.1–6.3)** | | |
| 6.1 | `fixtures/schema-15.sql` (every table, new ones filled); migration 16 test-first against it, including the `user_modules` rebuild with both users' modules kept; `ModuleId` gains `themis`; admin toggles list it | 0085, 0092 | ⬜ |
| 6.2 | Themis repositories and `packages/shared/src/themis.ts`; areas and goals routes with their rules (delete-when-empty, outcome fixed, cascade on goal delete), behind `requireModule( 'themis' )`; isolation tests | 0092 | ⬜ |
| 6.3 | `themis/periods.ts` (weeks, months, quarters, study days, check-in due) as pure functions; metric updates and check-ins routes | 0092 | ⬜ |
| 6.4 | Goal–subject links (`PUT /goals/:id/subjects`, subject `goal_id` in `PATCH`); `GET /themis/overview` and `GET /goals/:id` with learning, metric and check-in outcomes | 0090, 0092 | ⬜ |
| **Phase 7** | **Time (TRD §7)** | | |
| 7.1 | `time.service.recordAnswerTime` inside `recordReview`'s transaction (extend or start a session, day of start, final credit); `melete_session_gap_minutes` and `melete_final_card_seconds` settings; `seconds_this_week` real | 0091 | ⬜ |
| 7.2 | `/api/time-entries` CRUD for logged entries with its rules; overview and goal time sum measured and logged as TRD §6.3 | 0091, 0092 | ⬜ |

**Checkpoint C done when:** the API can hold areas, goals, metrics and check-ins, answers produce measured sessions, logged time can be added, and the overview returns correct period totals; the upgrade test from schema 15 passes.

---

## Checkpoint D: Phases 8–9 (Themis web, release)
**Plan:** ⬜ [`plans/checkpoint-d.md`](plans/checkpoint-d.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 8** | **Themis web (TRD §6.4, §7.2)** | | |
| 8.1 | Drawer order Themis, Mnemosyne, Melete; `moduleHome.ts` with `/themis` first; routes `/themis` and `/themis/goals/:goalId` | 0092 | ⬜ |
| 8.2 | Themis home: empty state, areas, goal cards with the three outcome displays, the time-per-area bars with the period toggle, check-ins due answered in place | 0092 | ⬜ |
| 8.3 | Area, goal, metric update and link-subjects dialogs; goal detail page; All goals list | 0092 | ⬜ |
| 8.4 | Log time dialog (shared) from Themis and Melete subject pages; subject Settings tab goal picker; `test:browser` for the dialog on a narrow viewport | 0091 | ⬜ |
| **Phase 9** | **E2E, docs, release** | | |
| 9.1 | Anthropic fake: syllabus, extended generate, map, suggest; the two e2e specs (TRD §9) | | ⬜ |
| 9.2 | `docs/architecture.md` final pass; `docs/v1.1.0/release-notes.md` from TRD §10, linked from `docs/README.md` | | ⬜ |
| 9.3 | `fixtures/schema-16.sql`; lock migrations 15 and 16 with `migrations:lock` and commit the lock file; `migrations:lock --check` passes | 0085 | ⬜ |
| 9.4 | With Naresh: `release.sh 1.1.0`, `deploy.sh 1.1.0` (schema 14 → 16), one subject through draft → approve → map, one goal with logged time; findings fixed here | 0086 | ⬜ |

**Checkpoint D done when:** Themis is the landing page, both e2e specs pass, migrations are locked, and 1.1.0 runs on the VM at schema 16. Naresh merges `release/1.1.0` into `main` and tags.

---

## Log
- 1.1: version 1.1.0 everywhere. `scripts/version.test.mjs` changed: its docs check now requires a docs/README.md line for the current version and that CLAUDE.md's Workflow paths point at `docs/v<major>.<minor>.0` (it required the 1.0 readiness link and ADR 0084). `scripts/nameGuard.test.mjs` changed: its history list now includes `docs/v1.1.0/` and ADRs 0089+ (they name Mnemosyne and were failing the guard). ADRs 0089–0093 were already listed in docs/README.md.
- 2.1: migration 15 (`meleteConceptLayer`) appended, not locked; upgrade tests from `schema-14.sql` added. ADR 0094 changes TRD §2.1: `melete_note_concepts` gets `user_id` (the schema guard requires it). Changed tests: `database.test.ts` (latest-schema column, index and table lists), `database.upgrade.test.ts` (new cases only). No `ALLOWED_COUNT_CHANGES` entry (no rows change). The `READERS` map gets the new tables once `schema-15.sql` exists (6.1), since its first test compares it with schema 13.
- 2.2: sections, concepts and note-concepts repositories; subject, note, question and run records gain the new columns (`setQuestionConcept`, `NoteChanges` takes `mapping_pinned` as a boolean); `MeleteRunKind` widened, `recordMeleteRun` takes `subjectId`; shared `MeleteSubject` (+ level, intent, status, error, coverage/mastery/concept_count still null), `MeleteSyllabus`, `MeleteSyllabusEdit` (80 cap, no empty section), `MeleteSyllabusDiff`, `MeleteSyllabusOutput`, `UpdateMeleteSubjectBody` (+ `target_level`, `intent`). Changed existing tests: `packages/shared/src/melete.test.ts` (subject fixture), `meleteSubjects`/`meleteNotes`/`meleteQuestions`/`meleteRuns.repository.test.ts` (new fields in expected records and the run fixture), `signature.guard.test.ts` (three new repositories), `meleteReview.service.test.ts` (`subject_id: null` in two run inserts), web `test-support/melete.fixture.ts`. New: `melete/runs.test.ts`.
