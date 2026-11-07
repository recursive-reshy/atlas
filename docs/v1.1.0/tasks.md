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
| 3.1 | Prompt purposes `melete_syllabus`, `melete_map`, `melete_suggest` with locked instructions and default guidance, seeded and shown in Settings → Prompts; model settings `melete_syllabus_model`, `melete_map_model`, `melete_suggest_model` in Settings → Models | 0089 | ✅ |
| 3.2 | `PATCH` subject `target_level`/`intent`; Draft syllabus call and processing (dedupe, 80 cap, empty sections) as pure functions; loop takes drafts first; failure keeps the old syllabus; `syllabus` run recorded | 0089 | ✅ |
| 3.3 | `GET`/`PUT` syllabus with the diff (rename, add, remove, move) and its counts; `approve` queues every enrolled note for Map | 0089 | ✅ |
| 3.4 | Web: subject view as tabs (Overview placeholder, Syllabus, Notes, Settings); syllabus setup (level, intent), drafting state, editor (sections, concepts, reorder, add, remove), Approve, Redraft; `test:browser` for reordering | 0089 | ✅ |

**Checkpoint A done when:** a subject can be given a level, get a drafted syllabus, be edited and approved, and the upgrade test from schema 14 passes.

---

## Checkpoint B: Phases 4–5 (mapping, numbers and suggestions)
**Plan:** ✅ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 4** | **Mapping (TRD §4)** | | |
| 4.1 | Generate extended for approved subjects: concept refs, note concepts, question labels, off-syllabus with suggestion; ref mapping and fallback label as pure functions; unapproved subjects unchanged | 0089 | ✅ |
| 4.2 | Map call (full and labels-only) in the loop after generation; never touches questions' FSRS state (test asserts it); `map` run recorded; `mapping` failure and retry; interrupted mapping and drafting requeued on startup | 0089 | ✅ |
| 4.3 | Remap triggers (TRD §4.3) on `PUT` syllabus, approve, redraft, `POST …/syllabus/remap`; pinned notes skipped | 0089 | ✅ |
| 4.4 | `PUT /notes/:id/concepts` (hand, pinned, labels-only Map); off-syllabus `dismiss` and `add_concept`; web: concepts and flags in the Notes tab, mapping editor on the note page | 0089 | ✅ |
| **Phase 5** | **Numbers, gaps, suggestions, landing (TRD §5)** | | |
| 5.1 | `melete/mastery.ts`: coverage, question score, concept mastery, buckets, section and subject roll-ups; `melete_mastery_days` setting; table tests | 0090 | ✅ |
| 5.2 | `GET …/gaps` with `next_step`; `review/next?concept=` | 0090 | ✅ |
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
- 3.1: prompt purposes `melete_syllabus`, `melete_map`, `melete_suggest` (locked instructions and default guidance in `melete/prompts.ts`, profiles "Melete syllabus", "Melete mapping", "Melete suggestions"), shown in Settings → Prompts; models `melete_syllabus_model` and `melete_suggest_model` default to the shipped Sonnet, `melete_map_model` to the first Haiku, shown in Settings → Models. **Existing users:** `seedUser` only ran for new users, so `seedAllUsers` now runs at startup (idempotent, skips what a user already holds) and gives Naresh and his brother the three profiles on the first 1.1 start; not in the TRD, covered by §4.5 "seeded like `melete_questions`". No `*_profile_id` settings were added for the new prompts (nothing reads them). Changed existing tests: shared `summarizer.test.ts`; server `settings.service.test.ts`, `prompts.service.test.ts`, `seedUser.service.test.ts`, `settings.routes.test.ts`, `promptProfiles.routes.test.ts`, `moduleGating.routes.test.ts`, `promptProfiles.repository.test.ts`, `melete/prompts.test.ts`; web `PromptList.test.tsx`, `PromptsTab.test.tsx`, `PromptPanel.test.tsx`, `MeleteSettings.test.tsx`, `useMeleteProfiles.test.ts` and `test-support/summarizer.fixture.ts`.
- 3.2: `PATCH` subject takes `target_level` and `intent` (blank = none); `POST /api/melete/subjects/:id/syllabus/draft` → 202 with the subject `drafting` (400 without a level, 409 while drafting); `draftSyllabus` client call (8192 tokens, medium effort); `melete/syllabus.ts` (pure: trim, unique names case-insensitively, cap 80 and count the dropped, drop empty sections; a section with an empty name becomes "General" so its concepts are kept); `meleteSyllabus.service` stores the draft in one transaction with its `syllabus` run, or `failed` with the reason and a failed run, keeping the old syllabus; the loop (`claimNextDraft`) drafts before it generates, once per subject per pass. **Recovery:** an interrupted `generating` note is requeued at start by `requeueGenerating()`; a subject left `drafting` needs no requeue because `drafting` is itself the queue, so the next pass takes it. Drafts have priority over question generation across all users (the TRD's "in this order within a user" is not applied per user; drafts are rare and someone is waiting). New `melete_subject_id` log-context key. Changed existing tests: `routes/melete.routes.test.ts` (new cases only), `worker/meleteGenerator.test.ts` (draft mock and cases), `repositories/system.repository.test.ts` (new cases only); new: `melete/syllabus.test.ts`, `services/meleteSyllabus.service.test.ts`.
- 3.3: `GET`/`PUT .../syllabus` and `POST .../syllabus/approve`. `PUT` is allowed while the status is `draft` or `approved` (409 otherwise), is atomic, refuses ids the subject does not have (400), and keeps concept ids so mappings and labels survive renames and moves. The diff counts concepts only: `renamed` (name or description changed), `added`, `removed`, and `moved` (section changed, or out of relative order — a drag counts once, the shift from a removal or an addition counts for nothing); a section rename is not counted. Approving a second time is a 409 (decided in the plan); approving needs a `draft` with at least one concept (409) and queues every enrolled, non-missing note, pinned ones too (TRD §4.3). New `queueMappingForSubject` in the notes repository; shared `SaveMeleteSyllabusResponse`, `ApproveMeleteSyllabusResponse`; the `GET` answers with `MeleteSyllabus`. README API paragraph updated. Existing tests changed: none beyond additions (`routes/melete.routes.test.ts`, `meleteNotes.repository.test.ts`, shared `melete.test.ts`).
- 3.4: `MeleteSubject` as tabs (Overview placeholder, Syllabus, Notes, Settings; the open tab is `?tab=`, Overview by default); new `SyllabusPanel`, `SyllabusSetup`, `SyllabusEditor` (+ `SyllabusSectionCard`, `SyllabusConceptRow`, pure `syllabusDraft.ts`), `SubjectSettings`, `SubjectNotes`; `api/syllabus.api.ts`, `useMeleteSyllabus` (off until there is a syllabus, so it refetches when a draft lands), `useSyllabusMutations`; `useMeleteSubject` also polls while `drafting`; Melete prompts list and Models section already done in 3.1. Reordering is with arrows (no new dependency): a concept moves up or down and crosses into the neighbouring section at the edges. Changed existing tests: web `MeleteSubject.test.tsx` (enrolment controls and notes are now under the Settings and Notes tabs), `useMeleteSubject.test.ts` (new case), e2e `melete.spec.ts` (opens the Settings and Notes tabs). New: `SyllabusEditor.browser.test.tsx` (reordering and tap sizes on a phone and a desktop, light and dark). README and `apps/web/CLAUDE.md` updated.
- 4.1: Generate for an approved subject is one call that also maps: `generateApprovedQuestions` (shared `MeleteApprovedQuestionsOutput`, `callQuestions` shared with the plain call), second locked form `LOCKED_INSTRUCTIONS_MELETE_QUESTIONS_APPROVED` (same guidance profile), user message with a `## Concepts` list of refs and a `## Note`. Pure `melete/conceptRefs.ts` (refs, list, `resolveRefs`: known, unique, at most 5) and `processApprovedQuestions` (reuses `processQuestions` per question; a question outside the note's concepts gets the first; the off-syllabus suggestion counts only with no concept). Stored in the existing transaction: mapping as `claude`, hand pins cleared, `off_syllabus = flagged` + suggestion or null, `mapping` idle. Unapproved subjects are unchanged. Shared `MeleteNote` gains `mapping`, `mapping_error`, `mapping_pinned`, `off_syllabus`, `off_syllabus_suggestion`, `concept_ids`. Changed existing tests: shared `melete.test.ts` (note fixture), web `test-support/melete.fixture.ts`; additions in `claude.client.test.ts`, `melete/prompts.test.ts`, `melete/questions.test.ts`, `meleteQuestions.repository.test.ts`, `meleteGeneration.service.test.ts`, `melete.service.test.ts`; new `melete/conceptRefs.test.ts`.
- 4.2: Map call and loop. `mapNote` (shared `MeleteMapOutput`, 2048 tokens; the question calls and Map share `callStructured` in the client), pure `melete/map.ts` (`buildMapUser`, `processMap`: a question keeps its label unless Claude gives another of the note's concepts, else the first concept), `services/meleteMapping.service.ts` (`mapForNote`), `claimNextMapping` (queued mapping and `generation = 'idle'`, same turns as generation) and `requeueMapping` in `system.repository.ts`, the loop takes mapping third. A test asserts every question column but `concept_id` is identical after Map. **Decisions:** a hand-mapped note is labelled only (concepts fixed), but a pinned note with no concepts left (after a redraft) is mapped in full and unpinned, since its pin named concepts that are gone (approve queues pinned notes too); labels-only never changes `off_syllabus`. **Recovery (TRD §8):** `requeueMapping()` at start puts `mapping` notes back to `queued`, as `requeueGenerating()` does for `generating`; `drafting` needs none. `POST /notes/:id/retry` now also retries a failed mapping (409 when neither failed). Changed existing tests: none beyond additions (`meleteGenerator.test.ts`, `melete.routes.test.ts`, `system.repository.test.ts`, `claude.client.test.ts`, shared `melete.test.ts`); fixture `addNote` takes `mapping` and `mappingPinned`; new `melete/map.test.ts`, `services/meleteMapping.service.test.ts`.
- 4.3: remap triggers (TRD §4.3). `saveSyllabus` on an approved subject queues, in its transaction, the unpinned `flagged` notes when `diff.added > 0` and the unpinned notes that lost their last concept to a removal (found by `listNoteIdsForConcepts` before the delete, `noteIdsWithoutConcepts` after); a draft queues nothing, and renames, descriptions and moves queue nothing. `POST /api/melete/subjects/:id/syllabus/remap` (202 `{ queued }`, 409 unless approved) queues every enrolled, unpinned note. Automatic queues (`queueMappingUnpinned`, `queueMappingFlagged`, `queueMappingForNotes`) skip pinned, unenrolled and missing notes and a note whose Map is running (`mapping = 'mapping'`; if a concept is added during that call the note is not retried until the next trigger), and retry a `failed` one; approve still queues pinned notes too. Shared `RemapMeleteSyllabusResponse`. Changed existing tests: `melete.isolation.routes.test.ts` (the 404 list has the remap route, 12 entries); additions elsewhere.
- 4.4: `PUT /api/melete/notes/:id/concepts { concept_ids }` (`setNoteConceptsByHand`: 409 unless the subject is approved, 400 for a concept outside its syllabus; writes `hand`, pins, clears the flag, queues a labels-only Map for an enrolled live note; an empty list pins with no concepts and unlabels the questions directly, no Map) and `POST /api/melete/notes/:id/off-syllabus` (`dismiss`, or `add_concept` with `section_id` and optional `name`, default the suggestion; 409 unless flagged or on a duplicate name, 404 for a section of another subject; also queues the other flagged notes). Shared `UpdateNoteConceptsBody`, `OffSyllabusActionBody`; `noteView` exported from `melete.service`. Web: `MeleteNoteRow` shows concept chips, Mapping…/Mapping failed with Retry and `OffSyllabusNotice`; `SubjectNotes` takes the syllabus; `MeleteNote` has the mapping failure alert and `NoteConceptsEditor` (MUI `Autocomplete`, already in the dependency); hooks `useSetNoteConcepts`, `useOffSyllabusAction` in `useNoteMappingMutations` and `useNoteResponse` moved out of `useMeleteMutations` (it passed the 150-line limit). Known edge: a hand edit or a concept added while Map is running on that note can be overwritten by that run's result. Changed existing tests (additions only to their setup): web `MeleteNoteRow.test.tsx` (new props), `MeleteSubject.test.tsx` and `MeleteNote.test.tsx` (new hook mocks), `melete.isolation.routes.test.ts` (14 routes), `useMeleteMutations.test.ts` unchanged. New: server `meleteNoteMapping.service.test.ts`; web `OffSyllabusNotice`, `NoteConceptsEditor`, `SubjectNotes`, `useNoteMappingMutations` tests. `test:browser`: 86 passed.
- 5.1: `melete/mastery.ts` (pure: `questionScore`, `computeConceptStats`, `rollUp`, `MASTERY_THRESHOLD = 0.7`; table tests) and `listConceptUsage` (two queries per subject). **Decision:** only enrolled notes still in the vault count, for coverage and for their questions' mastery alike (the TRD says active questions with a concept; a question of an unenrolled or missing note would otherwise raise the mastery of an uncovered concept). `MeleteSubject.coverage`, `mastery` and `concept_count` are now real (null unless approved with concepts). Setting `melete_mastery_days` (shared `Settings`/`UpdateSettingsBody`/`UserSettingKey`, `getMasteryDays`, a Melete-module key, a number field in Settings → Models). Changed existing tests: `settings.service.test.ts` and `settings.routes.test.ts` (the full settings now include `melete_mastery_days: 21`), shared `summarizer.test.ts`, web `test-support/summarizer.fixture.ts`; fixtures `addQuestion` takes `reps`, `stability`, `conceptId`.
- 5.2: `GET /api/melete/subjects/:id/gaps` (shared `GetMeleteGapsResponse`, `MeleteNextStep`; `nextStep` is pure in `mastery.ts`; 409 unless approved) and `review/next?concept=<id>` (`listForConcept`; the concept's subject is used, `subject` is ignored when both are given; 404 for an unknown or another user's concept). **Decisions:** a concept review includes never-asked questions outside the daily new limit (stamped with a due time like any served new question), and a not-yet-due question already reviewed today is skipped, so the review is one pass per day rather than looping on the same questions; a question due again (learning steps) is served whenever. Quick or typed mode is the web's, as for any review. Changed existing tests: `melete.isolation.routes.test.ts` (15 routes); fixture `addQuestion` takes `lastReview`.
