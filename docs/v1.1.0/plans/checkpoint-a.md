# Checkpoint A plan: Phases 1–3 (kick-off, Melete data, syllabus)

Release branch `release/1.1.0`. Tasks 1.1, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, in order, one commit each (`feat(1.1-<id>): …`), pushed after each. Saved on approval to `docs/v1.1.0/plans/checkpoint-a.md`, with the Plan cell ticked and committed as `docs(1.1-plan): checkpoint A`.

Findings from reading the code (they shape the tasks):
- `docs/v1.1.0/` already exists, but root `CLAUDE.md` and `docs/README.md` still point at `v0.11.0`. Task 1.1 fixes both.
- Fixtures: `apps/server/src/repositories/fixtures/schema-13.sql` and `schema-14.sql` exist. `schema-15.sql` is not needed until 6.1. Loaded by `test-support/schemaAt.ts`.
- `SCHEMA_BASE = 9`, so migration 15 is the 15th entry in `migrations` (stored schema 15). Check the array length is 14 first.
- `melete_runs.prompt_version_id` is NOT NULL. A `syllabus` run needs a prompt version, so prompt purposes (3.1) come before the draft call (3.2).
- The loop is `worker/meleteGenerator.ts`. It requeues notes left `generating` at start (test at `meleteGenerator.test.ts:142`). Drafting recovery in 3.2 copies that approach (TRD §8 asks me to note it in the log).
- The web has no drag-and-drop library, and "don't add a dependency" applies. The syllabus editor reorders with up/down buttons. If you want drag and drop, that needs an ADR.

## 1.1 Version 1.1.0 kick-off
- **Files:** `package.json` (root, `apps/agent`, `apps/web`, `apps/server`, `packages/shared`, `e2e`), `apps/agent/pyproject.toml`, `apps/agent/uv.lock` (atlas-agent entry, line 57), README status line, root `CLAUDE.md` (current version 1.1.0, Workflow paths `docs/v1.1.0`, plans path), `docs/README.md` (confirm v1.1.0 and ADRs 0089–0093 are listed; replace the "planning docs still in v0.11.0" sentence).
- **Test first:** `version.test.ts` already compares `appVersion` to the server `package.json`, so it can't catch a missed file. Add a small `deploy/` or root `node:test` check that every manifest, `pyproject.toml` and the `uv.lock` entry share one version. Check first whether `deploy/release.sh` or its test already has one, and extend that rather than add a file.
- **Red → green:** bump one file → check fails → bump the rest → passes.
- **Verify:** root `pnpm test`, lint, typecheck.

## 2.1 Migration 15 (test-first, not locked)
- **Files:** `repositories/database.ts` (append the TRD §2.1 SQL to `migrations`, verbatim), `database.upgrade.test.ts`, `database.schema.test.ts` if it lists tables.
- **Tests first:**
  - In `database.upgrade.test.ts`, load `schema-14.sql`, run the migration, and assert every subject has `syllabus_status = 'none'` and null level, intent and error, every note has `mapping = 'idle'` and `mapping_pinned = 0`, and the three new tables are empty.
  - Row counts are unchanged, so `ALLOWED_COUNT_CHANGES` gets no entry.
  - Add CHECK constraint tests (bad `target_level`, `syllabus_status`, `mapping`, `source`).
  - Check the `ON DELETE SET NULL` on `melete_questions.concept_id` and the cascade from concepts to `melete_note_concepts`.
  - Extend the existing readers (`READERS`) so `melete_subjects` and `melete_notes` read back through the repositories.
- **Red → green:** fails with the missing columns → add the migration → passes.
- **Not touched:** `migrations.lock.json`, `SCHEMA_BASE`, any locked migration. `migrationLock.test.ts` must still pass (15 is unlocked until 9.3).

## 2.2 Repositories and shared schemas
- **Tests first:**
  - `meleteSubjects.repository.test.ts`: the new fields come back, and `updateSubject` handles `target_level`/`intent`/syllabus status and error.
  - New `meleteSections.repository.test.ts` and `meleteConcepts.repository.test.ts`, covering list in order, insert, update, delete, replace-all in a transaction, and user isolation (another user's id is not found).
  - New `meleteNoteConcepts.repository.test.ts`: set and list mappings with source, and cascade on concept delete.
  - Extend `meleteNotes.repository.test.ts` for `mapping`, `mapping_error`, `mapping_pinned`, `off_syllabus` and its suggestion.
  - Extend `meleteQuestions.repository.test.ts` for `concept_id`.
  - `meleteRuns.repository.test.ts`: `subject_id` and the new kinds.
- **Code:** `meleteSubjects.repository.ts` (`SubjectRecord`, `SubjectChanges`), new `meleteSections.repository.ts`, `meleteConcepts.repository.ts`, `meleteNoteConcepts.repository.ts`, `meleteNotes.repository.ts`, `meleteQuestions.repository.ts`, `meleteRuns.repository.ts` (`NewMeleteRun.kind` enum and `subject_id`), `melete/runs.ts` (`MeleteRunKind` widened to `generate | grade | syllabus | map | suggest`, optional `subjectId`).
- **Shared (`packages/shared/src/melete.ts`):**
  - `MeleteSubject` gains `target_level`, `intent`, `syllabus_status`, `syllabus_error`, plus `coverage`, `mastery`, `concept_count` (null for now). `goal_id` comes in 6.4.
  - New `MeleteTargetLevel`, `MeleteSyllabusStatus`, `MeleteSyllabus` (sections of concepts with ids), `MeleteSyllabusEdit` (ids optional), `MeleteSyllabusDiff` and `MeleteSyllabusOutput` (Claude's tool output).
  - Shared schema tests go beside the existing ones.
- **Existing tests that change:** any fixture or test that builds a `MeleteSubject` or `SubjectRecord` literal. I will list them in the log line.

## 3.1 Prompt purposes and model settings
- **Tests first:**
  - `prompts.test.ts` and `prompts.service.test.ts`: the three new purposes are seeded per user, listed under `purpose=melete_syllabus|melete_map|melete_suggest|all`, gated by the Melete module (`PURPOSE_MODULE`), ordered in `PURPOSE_ORDER`, reset and restore like the others, and the locked text is exposed.
  - `settings.service.test.ts`: `melete_syllabus_model`, `melete_map_model` and `melete_suggest_model` get a default (Sonnet, Haiku, Sonnet; same resolver pattern as `resolveHaikuModel`), are validated with `assertKnownModel`, and are stored per user.
  - Shared `SettingsResponse`/update schema tests.
  - Web: `PromptsTab` lists the new purposes and Settings → Models lists the new models.
- **Code:**
  - `melete/prompts.ts`: seed keys, `LOCKED_INSTRUCTIONS_MELETE_SYLLABUS` (size guidance per level; sections of concepts; one-line descriptions; no more than 80 in total), `LOCKED_INSTRUCTIONS_MELETE_MAP`, `LOCKED_INSTRUCTIONS_MELETE_SUGGEST` (3–5 resources, never URLs), and default guidance.
  - `prompts.service.ts`, `settings.service.ts`, `packages/shared/src/summarizer.ts` (keys, response, update).
  - `PromptsTab` and the models UI.
  - The seeding path for existing users: check how `melete_questions` was seeded for users who already exist, and do the same, so the VM's existing users get the new profiles.
- **Not in 3.1:** the extended Generate form of the questions instructions (that is 4.1).

## 3.2 Draft syllabus: call and processing
- **Tests first (pure, table tests):** `melete/syllabus.test.ts`
  - Trim.
  - Drop empty names.
  - Drop duplicate concept names (case-insensitive, within the subject).
  - Cap at 80 concepts, later ones dropped, with the dropped count returned.
  - A section left empty is dropped.
  - An input builder: name, level, intent, at most 60 notes, title plus the first 300 characters.
- **Service tests (fake Claude client):** `services/meleteSyllabus.service.test.ts`
  - Success replaces sections and concepts in one transaction and sets `draft`.
  - Failure sets `failed` and `syllabus_error`, and the old syllabus is untouched.
  - A `syllabus` run is recorded with `subject_id`, tokens and the prompt version, on success and on failure.
  - `target_level` is required, otherwise 400.
  - The call is refused while `drafting`.
- **API tests:**
  - `PATCH /subjects/:id` accepts `target_level` and `intent` (≤ 500 characters).
  - `POST …/syllabus/draft` returns 202 and sets `drafting`.
  - Another user's subject is 404.
  - A user without Melete gets 404.
- **Loop tests:** in `worker/meleteGenerator.test.ts`, drafts go before generation within a user, round-robin across users is kept, and subjects left `drafting` at start are picked up again (the draft queue is the subjects with that status).
- **Code:**
  - `melete/syllabus.ts` (pure).
  - `clients/claude.client.ts` gets a `draftSyllabus` tool-use call, written like `generateQuestions`.
  - `services/meleteSyllabus.service.ts`.
  - `controllers/melete.controller.ts` and `routes/melete.routes.ts`.
  - `worker/meleteGenerator.ts`.
  - Logs carry IDs only: no subject name, intent or concept names (ADR 0049).
- **Log line:** how an interrupted `generating` note is recovered today (`meleteGenerator.ts:17`) and that drafting does the same.

## 3.3 Syllabus GET/PUT with diff, approve
- **Tests first:** `melete/syllabusDiff.test.ts` (pure)
  - Rename or re-description (same id) is an update only.
  - A new concept (no id) is an insert.
  - A missing concept is a delete.
  - Position and section moves update `position` and `section_id`.
  - Counts are returned for each kind (`renamed`, `added`, `removed`, `moved`).
  - The 80 cap and the no-empty-section rule are refused with 400.
  - Ids that belong to another subject or user are refused.
- **API tests:**
  - `GET` returns sections and concepts in order.
  - `PUT` applies the diff in one transaction, and deleting a concept cascades its mappings and nulls its question labels.
  - `approve` needs a `draft` status, sets `approved` and sets `mapping = 'queued'` on every enrolled, non-missing note. Remapping itself is task 4.2.
  - A second approve is idempotent or 409. Decide in the test and write it in the log.
  - Isolation: other users get 404.
- **Code:** `melete/syllabusDiff.ts`, the service, the controller and the routes. The `PUT` is allowed in `draft` and `approved` status, and refused in `none`, `drafting` and `failed`.
- **Out of scope here:** the other remap triggers on `PUT` (4.3).

## 3.4 Web: subject tabs and syllabus UI
- **Tests first (Testing Library):**
  - `MeleteSubject.test.tsx`: tabs Overview (placeholder), Syllabus, Notes, Settings, with Notes holding today's list and Settings holding the existing `SubjectControls` plus level and intent.
  - Syllabus setup (status `none`): the level picker with its four explanations, optional intent, **Draft syllabus**, disabled until a level is chosen.
  - A `drafting` progress state, with polling through TanStack Query while drafting.
  - At `draft`, the editor with Approve. At `approved`, the editor with **Redraft**. A `failed` status shows the error and **Draft syllabus** again.
  - Editor: rename, describe, add and remove a concept, add and remove a section, reorder with up/down buttons, and an 80-concept warning.
  - Hooks tests: `useMeleteSyllabus`, `useDraftSyllabus`, `useSaveSyllabus`, `useApproveSyllabus`.
- **Browser test:** `test:browser` for reordering on a narrow viewport (the up/down buttons move a concept and the order survives a save).
- **Code:** `api/melete.api.ts`, new hooks under `src/hooks`, new components `SyllabusSetup`, `SyllabusEditor` and `SubjectTabs` (one folder each with `index.ts`, per the repo layout), and an update to `MeleteSubject.tsx`. The Overview tab is a placeholder until 5.3.
- **Docs:** `apps/web/CLAUDE.md` if its component list changes.

## Docs kept in step (same commits as the part they describe)
- `docs/architecture.md`: concept layer and syllabus (2.1/3.2/3.3).
- `apps/server/CLAUDE.md` and `apps/web/CLAUDE.md`: new modules and routes, as they are added.
- `tasks.md`: tick Status and add a log line per task. The Plan cell is ticked with the plan commit.
- Update the README's endpoint paragraph? Only if it lists Melete endpoints for 1.1. I will mention it rather than assume.

## Verification (every task, for the folders it touched; end of the checkpoint for all)
- `pnpm --filter @atlas/server test`, `lint`, `typecheck`.
- `pnpm --filter @atlas/web test`, `test:browser`, `lint`, `typecheck`.
- `@atlas/shared` tests, lint, typecheck. The agent's tests and the `deploy/` tests via the root `pnpm test`.
- `pnpm e2e` is only required from checkpoint F on, and the e2e specs for 1.1 come in 9.1, so I will run it once at the end of A as a regression check and report it.
- Checkpoint A is done when a subject can be given a level, get a drafted syllabus (fake Claude), be edited and approved, and the upgrade test from schema 14 passes.

## Questions or decisions for you
1. Reordering with up/down buttons (no new dependency), unless you want an ADR for a drag-and-drop library.
2. A second `approve` on an already approved syllabus: I plan to treat it as a 409, and the UI only offers Redraft.
