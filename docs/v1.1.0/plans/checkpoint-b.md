# Checkpoint B plan: Phases 4–5 (mapping, numbers and suggestions)

Release branch `release/1.1.0`. Tasks 4.1–4.4 and 5.1–5.4, in order, one commit each (`feat(1.1-<id>): …`), pushed after each. Saved on approval to `docs/v1.1.0/plans/checkpoint-b.md`, with the Plan cell ticked and committed as `docs(1.1-plan): checkpoint B`. ADRs: 0089 (4.x), 0090 (5.1, 5.2, 5.4), 0093 (5.3). No new ADR expected.

Findings from the code (they shape the tasks):
- Already in place from A: `melete_concepts`/`sections`/`note_concepts` repositories (`setNoteConcepts` replaces a note's mapping), `setQuestionConcept` (relabel without touching FSRS), `queueMappingForSubject` (queues every enrolled note, called by approve), `claimNextDraft`, `MeleteRunKind` with `map`/`suggest`, shared `MeleteOffSyllabus`, the `melete_map`/`melete_suggest` prompts and models.
- Missing: the web-facing `MeleteNote` has no mapping fields; `insertQuestions` takes no `concept_id`; no `claimNextMapping`; `requeueGenerating` only recovers `generating` (mapping recovery is new, same pattern); `coverage`/`mastery` are hard-coded `null` in `melete.service.ts:138`.
- The loop is `worker/meleteGenerator.ts`: drafts, then generation. Mapping becomes the third kind, in the TRD order.
- `claude.client.ts` has one function per call (`generateQuestions`, `draftSyllabus`); Map and Suggest get the same shape (`messages.parse` + `zodOutputFormat`).
- Tests use the existing fake Claude client, as in `meleteGeneration.service.test.ts`; nothing touches the network.
- Web has no drag library or new deps needed. The note page mapping editor is a multi-select of concepts.

## 4.1 Generate extended
- **Tests first:**
  - `melete/conceptRefs.test.ts` (pure): ids → `c1…cN` refs; refs → ids; unknown refs dropped; cap 5 concepts; a question whose `concept` is not among the note's concepts gets the note's first concept; fallback label when the note has no concepts (null).
  - `melete/questions.test.ts`: `processQuestions` keeps passage rules and carries `concept_id`.
  - `meleteGeneration.service.test.ts`: approved subject → prompt contains the concept list and uses the approved locked form; mappings written with `source = 'claude'`, `mapping_pinned` cleared; questions labelled; no concepts + `off_syllabus` → `off_syllabus = 'flagged'` with suggestion, questions unlabelled; unapproved subject → today's prompt/output and no mapping rows (existing tests pass unchanged).
  - `meleteQuestions.repository.test.ts`: `insertQuestions` stores `concept_id`.
  - `prompts.test.ts`: approved form of `LOCKED_INSTRUCTIONS_MELETE_QUESTIONS`.
  - `claude.client.test.ts` (if one exists beside the others): approved-output parse.
- **Code:** `melete/conceptRefs.ts` (new); `melete/prompts.ts` (second locked form, `buildMeleteSystemPrompt` takes the form); `packages/shared/src/melete.ts` (`MeleteApprovedQuestionsOutput`: `concepts`, `off_syllabus`, `questions[].concept`); `clients/claude.client.ts` (`generateQuestions` takes the schema or a sibling `generateApprovedQuestions`); `meleteQuestions.repository.ts` (`GeneratedQuestion.concept_id`); `meleteGeneration.service.ts` (branch on `syllabus_status === 'approved'`, write mapping and off-syllabus fields inside the existing transaction); shared `MeleteNote` gains `mapping`, `mapping_error`, `mapping_pinned`, `off_syllabus`, `off_syllabus_suggestion`, `concepts` (ids), and `melete.service.ts` fills them.
- **Red → green:** missing exports/columns → implement pure functions → service branch.
- **Changed existing tests:** any literal `MeleteNote` fixture (listed in the log).

## 4.2 Map call and loop
- **Tests first:**
  - `melete/map.test.ts` (pure): `buildMapUser` (concepts as refs, note body, numbered active questions); `processMap` (unknown refs dropped, question numbers out of range dropped, unlabelled questions keep their label or get the first concept, labels-only variant ignores `concepts`).
  - New `services/meleteMapping.service.test.ts`: full Map rewrites mappings (`source = 'claude'`) and `concept_id`; **asserts every question's FSRS columns, `state`, `due`, `reps` and row count are byte-identical before and after**; `map` run recorded with `subject_id`; failure sets `mapping = 'failed'` + `mapping_error` and keeps old mappings; labels-only keeps the given concepts fixed; a note changed during the call is left for the scan; note unenrolled/missing → `idle`.
  - `system.repository.test.ts`: `claimNextMapping` (eligible users, round-robin via `last_generation_started_at`, only `queued`), `requeueMapping` (`mapping` → `queued`).
  - `meleteGenerator.test.ts`: order is drafts → generation → mapping; mapping failure doesn't stop the pass; startup requeues interrupted `mapping`.
  - `notes retry` route test: `POST /notes/:id/retry` also retries a failed mapping.
- **Code:** `melete/map.ts` (new), `MeleteMapOutput`/`MeleteLabelsOutput` in shared, `claude.client.ts` `mapNote`, `services/meleteMapping.service.ts` (`mapForNote( userId, noteId, { labelsOnly } )`), `system.repository.ts` (`claimNextMapping`, `requeueMapping`, called beside `requeueGenerating`), `worker/meleteGenerator.ts`, retry in `melete.service.ts`.
- **Decision to note in the log (TRD §8):** `generating` recovery is `requeueGenerating()` at startup; mapping copies it, drafting is recovered by the loop itself since `drafting` stays set.
- Whether a pinned note's labels-only run is distinguished from a full one: the note carries `mapping_pinned`; pinned → labels-only. No extra column.

## 4.3 Remap triggers
- **Tests first** (`meleteSyllabus.service.test.ts`, `meleteNotes.repository.test.ts`, route test):
  - `PUT` syllabus on an approved subject: concept **added** → queues notes with `off_syllabus = 'flagged'` (not pinned); concept **removed** → queues notes left with no concept, unless pinned; rename/re-describe/reorder queue nothing; unapproved subjects queue nothing.
  - Approve and redraft→approve queue every enrolled note (existing `queueMappingForSubject`, kept: pinned too, per the TRD table); a redraft itself resets nothing until approved.
  - `POST /melete/subjects/:id/syllabus/remap`: every enrolled, unpinned note; 409 unless approved; returns the count.
  - Notes with missing/unenrolled state are never queued; queued notes aren't double-queued when already `mapping`.
- **Code:** `meleteNotes.repository.ts` (`queueMappingFlagged`, `queueMappingUnmapped`, `queueMappingUnpinned`, all skipping pinned except approve), `meleteSyllabus.service.ts` (call after `PUT`, using the diff counts and ids), controller + route + shared response.

## 4.4 Hand mapping, off-syllabus, web
- **Tests first:**
  - Route/service: `PUT /notes/:id/concepts { concept_ids }` writes `source = 'hand'`, `mapping_pinned = 1`, clears `off_syllabus`, queues labels-only Map; unknown or other-user concept ids → 404/400; empty list allowed (pins an unmapped note).
  - `POST /notes/:id/off-syllabus`: `dismiss` sets `dismissed`; `add_concept` inserts the concept (default name = suggestion, appended to the section), maps by hand, pins, queues labels-only; only valid while `flagged`.
  - Isolation test additions in `melete.isolation.routes.test.ts` for the three new routes.
  - Web (Testing Library): `SubjectNotes` shows concept chips and an off-syllabus flag with Dismiss/Add; a new `NoteConceptsEditor` on the note page selects concepts and saves; mapping failure shows with Retry; hooks invalidate the note, subject and syllabus queries.
- **Code:** controller/routes/service as above; shared `UpdateNoteConceptsBody`, `OffSyllabusActionBody`; web `SubjectNotes.tsx`, new `NoteConceptsEditor.tsx` and `OffSyllabusNotice.tsx`, `MeleteNoteRow.tsx`, hooks in `api/`.
- Update `apps/server/CLAUDE.md`, `apps/web/CLAUDE.md` and `docs/architecture.md` (mapping, third loop kind, new routes) in this commit.

## 5.1 Mastery (pure)
- **Tests first:** `melete/mastery.test.ts` tables: question score (`reps = 0` → 0; `min( 1, stability / days )`); concept mastery mean, covered-with-no-questions = 0; coverage needs enrolled, present, mapped note; buckets at exactly 0.7 (`solid`); section and subject roll-ups with uncovered counting 0; null when unapproved or no concepts; subject mastery ≤ coverage. Settings: `melete_mastery_days` default 21, range 7–90, validation + shared schema.
- **Code:** `melete/mastery.ts` (pure over plain rows), `meleteConcepts.repository.ts` `listConceptStats( userId, subjectId )` (one query for concept ⨝ note mappings ⨝ notes, one for concept ⨝ active questions with `stability`/`reps`), `settings.service.ts` + shared `SettingsResponse`/update + Melete settings tab field.
- **Wire in:** `melete.service.ts` fills `coverage`, `mastery`, `concept_count` on `MeleteSubject` (replacing the nulls).

## 5.2 Gaps and concept review
- **Tests first:** service tests for `getGaps` (sections with roll-ups; concepts with `bucket`, `mastery`, `note_count`, `question_count`; `next_step`: first uncovered in syllabus order → `cover`, else lowest-mastery weak → `review`, else `none`); 409/404 when not approved; route + isolation tests. `review/next?concept=`: serves that concept's active questions, most overdue first then not-yet-due by `due`; honours the user's quiz/quick mode; other-user concept → 404; recorded reviews are normal; new-per-day limit does not apply to a concept review of already-seen cards (assert the rule chosen: unseen cards of the concept are included, since the user asked for it explicitly).
- **Code:** `meleteReview.service.ts` (concept branch), `meleteQuestions.repository.ts` (`listForConcept`), `melete.service.ts` `getGaps`, shared `MeleteGaps`, controller/route.

## 5.3 Suggest resources and Overview tab
- **Tests first:**
  - `melete/suggest.test.ts` (pure): `processSuggestions` strips any `http`-containing text from every field (field kept, text removed; item dropped if `title` ends up empty), keeps 3–5, kind enum fallback `other`.
  - Service test: `POST /melete/concepts/:id/suggestions` returns synchronously, records a `suggest` run with `subject_id`, uses `melete_suggest_model`, not stored (no table writes besides the run), 60 s timeout passed to the client, failure → 502-style `MeleteError` with run recorded; other user's concept → 404.
  - Web: `OverviewTab` shows gap view by section with bucket styling, next step with Review (`/melete/review?concept=`), Suggest resources button → list with search links (YouTube search for `video`/`talk`, web search otherwise, `target=_blank rel=noopener`); no raw URLs from the server rendered.
- **Code:** `melete/suggest.ts`, `claude.client.ts` `suggestResources`, `services/meleteSuggest.service.ts`, shared `MeleteSuggestionsOutput`/response, web `SubjectOverview.tsx`, `GapSection.tsx`, `SuggestResources.tsx`, `searchLink.ts` (pure, tested), replace the Overview placeholder in the subject tabs.

## 5.4 Today as subject cards
- **Tests first:** `GET /melete/today` per subject: `coverage`, `mastery`, `syllabus_status`, `target_level`, `due_today`, `seconds_this_week` (always 0 until 7.1; test asserts 0); web `MeleteToday` renders one card per subject (name, level, two bars, due today, time this week, "Set up syllabus" when not approved) above **Review all due**; narrow-viewport layout one card per row.
- **Code:** shared `MeleteSubject` gains `due_today` and `seconds_this_week`; `melete.service.ts`; `MeleteToday.tsx`, new `SubjectCard.tsx`.

## Verification (per task, then at the end)
- Server: `pnpm --filter @atlas/server test`, `lint`, `typecheck`. Shared: its test/typecheck. Web: `test`, `lint`, `typecheck`, and `test:browser` at the end. Root `pnpm test` for the `deploy/` tests. `apps/agent` untouched.
- Before F, `pnpm e2e` isn't required; I'll still note that the e2e fake gets its new responses in 9.1.
- No migration in this checkpoint: `migrations.lock.json` and `migrationLock.test.ts` stay as they are.
- Report at the end: tasks with hashes, results per folder, ADRs (none expected), deferred items.

## Open points I'll decide as stated unless you say otherwise
1. Mapping failure retry reuses `POST /notes/:id/retry` (no new route).
2. A concept review includes unseen cards of that concept (explicit user request), ignoring the daily new-card limit.
3. A pinned note's Map run is always labels-only (no extra column).
