# Atlas v1.1.0 — Technical Requirements

Built from `prd.md` in this folder. Decided with Naresh on 2026-11-07; ADRs 0089–0093.

## 1. Changes at a glance
| Area | Change | ADR |
| --- | --- | --- |
| Melete data | Subjects get a target level, intent and syllabus; sections, concepts, note↔concept mappings and a concept label per question; migration 15 | 0089 |
| Melete Claude calls | **Draft syllabus** and **Map** (new), **Generate** extended with concepts and labels, **Suggest resources** (new); all in Express | 0089, 0093 |
| Melete numbers | Coverage and stability-based mastery, computed on read; gap view and next step | 0090 |
| Time | One `time_entries` table: measured sessions derived from saved answers, plus logged minutes | 0091 |
| Themis | New module: areas, goals, three outcome types, check-ins; migration 16 (includes the `user_modules` rebuild) | 0092 |
| Web | Melete landing as subject cards; subject view with gap, syllabus and notes; Themis home and goals; **Log time**; Themis first in the drawer | 0092 |

Naming: **subject** stays the word in the UI and in code (`melete_subjects`, `/api/melete/subjects`). No rename. Mnemosyne doesn't change.

## 2. Migrations
Both follow ADR 0085 and the root `CLAUDE.md` "Database changes" rule: written test-first against the seed of the schema they start from, appended to `migrations`, locked at the end of the release (§9).

### 2.1 Migration 15 — Melete concept layer (stored schema 15, seed `schema-14.sql`)
```sql
ALTER TABLE melete_subjects ADD COLUMN target_level TEXT
  CHECK ( target_level IN ( 'awareness', 'working', 'proficient', 'expert' ) );
ALTER TABLE melete_subjects ADD COLUMN intent TEXT;
ALTER TABLE melete_subjects ADD COLUMN syllabus_status TEXT NOT NULL DEFAULT 'none'
  CHECK ( syllabus_status IN ( 'none', 'drafting', 'draft', 'approved', 'failed' ) );
ALTER TABLE melete_subjects ADD COLUMN syllabus_error TEXT;

CREATE TABLE melete_sections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES melete_subjects ( id ) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE melete_concepts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES melete_subjects ( id ) ON DELETE CASCADE,
  section_id TEXT NOT NULL REFERENCES melete_sections ( id ) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX melete_concepts_subject ON melete_concepts ( subject_id, section_id, position );

CREATE TABLE melete_note_concepts (
  note_id TEXT NOT NULL REFERENCES melete_notes ( id ) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES melete_concepts ( id ) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK ( source IN ( 'claude', 'hand' ) ),
  PRIMARY KEY ( note_id, concept_id )
);
CREATE INDEX melete_note_concepts_concept ON melete_note_concepts ( concept_id );

ALTER TABLE melete_notes ADD COLUMN mapping TEXT NOT NULL DEFAULT 'idle'
  CHECK ( mapping IN ( 'idle', 'queued', 'mapping', 'failed' ) );
ALTER TABLE melete_notes ADD COLUMN mapping_error TEXT;
ALTER TABLE melete_notes ADD COLUMN mapping_pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE melete_notes ADD COLUMN off_syllabus TEXT
  CHECK ( off_syllabus IN ( 'flagged', 'dismissed' ) );
ALTER TABLE melete_notes ADD COLUMN off_syllabus_suggestion TEXT;

ALTER TABLE melete_questions ADD COLUMN concept_id TEXT
  REFERENCES melete_concepts ( id ) ON DELETE SET NULL;
CREATE INDEX melete_questions_concept ON melete_questions ( concept_id, state );

ALTER TABLE melete_runs ADD COLUMN subject_id TEXT;
```
- `melete_runs.kind` is plain text; it gains `syllabus`, `map` and `suggest` (the `MeleteRunKind` type in `runs.ts` widens).
- Allow-list: no row counts change. The upgrade test checks every existing subject reads back with `syllabus_status = 'none'` and every note with `mapping = 'idle'`.
- `fixtures/schema-15.sql` (new, written in phase 6 before migration 16) fills the new tables.

### 2.2 Migration 16 — Themis and time (stored schema 16, seed `schema-15.sql`)
- **`user_modules` rebuild** so its CHECK accepts `themis`: create `user_modules_new` with `module IN ( 'transcriber', 'melete', 'themis' )`, copy, drop, rename, recreate the primary key. Same pattern as migrations 10–13's health tables. Members start without Themis; the admin has every module already (ADR 0067).
```sql
CREATE TABLE themis_areas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX themis_areas_name ON themis_areas ( user_id, lower( name ) );

CREATE TABLE themis_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  area_id TEXT NOT NULL REFERENCES themis_areas ( id ),
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  target_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK ( status IN ( 'active', 'achieved', 'dropped' ) ),
  status_changed_at TEXT,
  outcome TEXT NOT NULL CHECK ( outcome IN ( 'learning', 'metric', 'checkin' ) ),
  metric_unit TEXT,
  metric_target REAL,
  checkin_cadence TEXT CHECK ( checkin_cadence IN ( 'weekly', 'monthly' ) ),
  created_at TEXT NOT NULL,
  CHECK ( ( outcome = 'metric' ) = ( metric_target IS NOT NULL ) ),
  CHECK ( ( outcome = 'checkin' ) = ( checkin_cadence IS NOT NULL ) )
);
CREATE INDEX themis_goals_area ON themis_goals ( user_id, area_id, position );

CREATE TABLE themis_metric_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES themis_goals ( id ) ON DELETE CASCADE,
  value REAL NOT NULL,
  note TEXT,
  at TEXT NOT NULL
);
CREATE TABLE themis_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES themis_goals ( id ) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK ( rating BETWEEN 1 AND 5 ),
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE ( goal_id, period_start )
);

ALTER TABLE melete_subjects ADD COLUMN goal_id TEXT
  REFERENCES themis_goals ( id ) ON DELETE SET NULL;

CREATE TABLE time_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK ( source IN ( 'measured', 'logged' ) ),
  subject_id TEXT REFERENCES melete_subjects ( id ) ON DELETE CASCADE,
  goal_id TEXT REFERENCES themis_goals ( id ) ON DELETE CASCADE,
  day TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  seconds INTEGER NOT NULL CHECK ( seconds > 0 ),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ( ( subject_id IS NULL ) <> ( goal_id IS NULL ) ),
  CHECK ( source = 'logged' OR subject_id IS NOT NULL )
);
CREATE INDEX time_entries_day ON time_entries ( user_id, day );
CREATE INDEX time_entries_open ON time_entries ( user_id, subject_id, source, ended_at );
```
- Areas are deleted only when empty (§6.1), so `themis_goals.area_id` has no cascade.
- `day` is the study day (`YYYY-MM-DD`) from `melete/day.ts` (app time zone and `MELETE_DAY_START_HOUR`).
- Allow-list: `user_modules` row count unchanged. The test checks both seed users keep their modules.

## 3. Melete: syllabus (ADR 0089)

### 3.1 Subject fields and API
- `MeleteSubject` (shared) gains `target_level`, `intent`, `syllabus_status`, `syllabus_error`, `goal_id`, plus computed `coverage`, `mastery`, `concept_count` (null until approved).
- `PATCH /api/melete/subjects/:id` accepts `target_level`, `intent` (≤ 500 chars) and, after phase 6, `goal_id` (must be the user's own active goal).
- Subjects are still created by the learning-root scan; a new subject means a new folder (the existing **New folder** in the learning root).

### 3.2 Draft syllabus
- `POST /api/melete/subjects/:id/syllabus/draft` → 202. Needs `target_level`. Sets `syllabus_status = 'drafting'` and queues the subject for the shared Melete loop (§4.4).
- **Input:** subject name (folder name), level, intent, and for each note in the folder (enrolled or not, at most 60) its title and first 300 characters of body.
- **Output** (`MeleteSyllabusOutput`, Zod, tool-use like question generation): `sections: [{ name, concepts: [{ name, description }] }]`.
- **Processing:** trim; drop empty names; drop duplicate concept names (case-insensitive) within a subject; cap at **80 concepts** (later ones dropped, logged as a count); a section left empty is dropped. Size guidance per level lives in the locked instructions: Awareness 8–12, Working knowledge 15–25, Proficient 25–40, Expert 40–60.
- **Store:** in one transaction, delete the subject's sections (concepts and mappings cascade; question labels go null), insert the new ones, set `syllabus_status = 'draft'`. A failure sets `failed` with `syllabus_error`; the old syllabus is untouched until the call succeeds.
- **Model:** setting `melete_syllabus_model`, defaulting to the same Sonnet default the summarizer uses. Recorded as a `syllabus` run with `subject_id`.

### 3.3 Editing and approval
- `GET /api/melete/subjects/:id/syllabus` → sections with concepts in order.
- `PUT /api/melete/subjects/:id/syllabus` takes the whole edited syllabus (sections and concepts; existing ids kept, new ones without ids). The server diffs it:
  - **renamed or re-described** concept (same id): update only;
  - **new** concept: insert;
  - **missing** concept: delete (mappings cascade, labels go null);
  - order and section changes: update `position` and `section_id`.
  It returns the diff counts. The 80-concept cap and the no-empty-section rule apply.
- `POST /api/melete/subjects/:id/syllabus/approve` sets `approved` and queues every enrolled note for **Map** (`mapping = 'queued'`).
- After approval, the same `PUT` drives remaps (§4.3). Redrafting an approved syllabus (§3.2) returns it to `draft`; approving it again remaps every note.

## 4. Melete: mapping (ADR 0089)

### 4.1 Generate, extended
When the note's subject is `approved`, the existing question-generation call also receives the concept list and returns:
```ts
{ concepts: string[],                        // short refs c1…cN, at most 5
  off_syllabus: { suggested_concept: string } | null,
  questions: { prompt, answer, passage, concept: string }[] }
```
- Concepts are sent as short refs (`c1`…) with name and description; the server maps refs to ids. Unknown refs are dropped.
- A question's `concept` must be one of the note's concepts; otherwise it gets the note's first concept.
- No concepts and `off_syllabus` set → `off_syllabus = 'flagged'` with the suggestion; questions are stored unlabelled.
- A subject without an approved syllabus uses today's prompt and output unchanged (`MeleteQuestionsOutput`).
- Mapping rows are written with `source = 'claude'`; `mapping_pinned` is cleared, since the content changed.

### 4.2 Map (new call)
For syllabus-driven remaps. **Input:** concept list, the note body, its active questions (prompt and answer, numbered). **Output:** `{ concepts, off_syllabus, labels: { question: number, concept: string }[] }`. It never creates or drops questions, so FSRS state is untouched; it only rewrites mappings and `concept_id`. Model setting `melete_map_model` (Haiku default). Recorded as a `map` run.

A **labels-only** variant runs after a hand edit (§4.3): the note's concepts are given as fixed, and only `labels` is read.

### 4.3 What triggers a remap
| Trigger | Notes queued for Map |
| --- | --- |
| Note content changes | none: Generate does it (§4.1) |
| Concept renamed or re-described | none |
| Concept added | notes with `off_syllabus = 'flagged'` |
| Concept removed | notes left with no concept, unless pinned |
| Syllabus approved (first time or after a redraft) | every enrolled note |
| **Remap all** (`POST …/syllabus/remap`) | every enrolled, unpinned note |

- **Hand edits:** `PUT /api/melete/notes/:id/concepts { concept_ids }` writes `source = 'hand'`, sets `mapping_pinned = 1`, clears `off_syllabus`, and queues a labels-only Map. Pinned notes are skipped by every automatic remap except a content change.
- **Off-syllabus actions:** `POST /api/melete/notes/:id/off-syllabus { action: 'dismiss' }`, or `{ action: 'add_concept', section_id, name }` which adds the concept (default name: the suggestion), maps the note to it by hand, and queues a labels-only Map.
- Notes are queued, never mapped inline, so a large remap doesn't block a request.

### 4.4 The loop
The existing shared Melete generator loop (ADRs 0058, 0064) takes three kinds of work, round-robin across users as today, in this order within a user: syllabus drafts, generation, mapping. A failure sets the note's `mapping = 'failed'` with `mapping_error` (or the subject's `syllabus_status = 'failed'`), retried by `POST /api/melete/notes/:id/retry` and by the existing **Retry**. Failures show on the note and the subject; there is no Status row for Melete work, as today.

### 4.5 Prompts and models
- New purposes in `PromptPurpose`: `melete_syllabus`, `melete_map`, `melete_suggest`, each with locked instructions in `melete/prompts.ts` and default guidance, seeded like `melete_questions`, and shown under **Settings → Prompts**.
- `LOCKED_INSTRUCTIONS_MELETE_QUESTIONS` gets a second form for approved subjects (concepts, labels and off-syllabus). The guidance stays the user's.
- New per-user model settings in **Settings → Models**: `melete_syllabus_model` (Sonnet), `melete_map_model` (Haiku), `melete_suggest_model` (Sonnet). Unknown models are refused as today.

## 5. Melete: numbers, gaps, suggestions, landing (ADRs 0090, 0093)

### 5.1 Coverage and mastery (`melete/mastery.ts`, pure)
- **Concept covered:** at least one mapped note that is enrolled and not missing.
- **Question score:** only `state = 'active'` questions with a `concept_id`. `reps = 0` → 0; else `min( 1, stability / masteryDays )`. `masteryDays` = setting `melete_mastery_days`, default 21.
- **Concept mastery:** mean of its question scores; a covered concept with no questions yet is 0.
- **Bucket:** `uncovered` (not covered) · `weak` (covered, mastery < 0.7) · `solid` (≥ 0.7). The 0.7 threshold is a constant.
- **Subject:** `coverage` = covered ÷ concepts; `mastery` = mean concept mastery over all concepts, uncovered counting 0. Both null when the syllabus isn't approved or has no concepts.
- **Section roll-ups:** the same two numbers over the section's concepts.
- Computed on read from one query per subject (concepts ⨝ mappings ⨝ notes, concepts ⨝ questions). No stored totals, no Claude call. Unit-tested as pure functions over plain rows.

### 5.2 Gap view
- `GET /api/melete/subjects/:id/gaps` → sections with their roll-ups and concepts (`bucket`, `mastery`, `note_count`, `question_count`), plus `next_step`:
  - the first uncovered concept in syllabus order → `{ kind: 'cover', concept_id }`;
  - else the concept with the lowest mastery among weak ones → `{ kind: 'review', concept_id }`;
  - else `{ kind: 'none' }`.
- **Concept review:** `GET /api/melete/review/next?concept=<id>` serves that concept's active questions, the most overdue first, then not-yet-due ones by `due`. Answers are recorded as normal reviews (FSRS handles an early review). Typed (quiz) or quick mode as the user's setting says.

### 5.3 Suggest resources (ADR 0093)
- `POST /api/melete/concepts/:id/suggestions` → 200, synchronous, 60 s timeout. Not stored.
- **Input:** subject name, level, intent, the concept's section, name and description.
- **Output** (`MeleteSuggestionsOutput`): 3–5 of `{ title, by, kind: 'book' | 'docs' | 'course' | 'video' | 'article' | 'talk' | 'other', why, query }`. **No URLs:** the locked instructions forbid them, and the server drops any `http` text from every field.
- The web builds the search link from `query`: a YouTube search for `video` and `talk`, a web search otherwise, opened in a new tab.
- Model setting `melete_suggest_model`; recorded as a `suggest` run with `subject_id`. No web search tool.

### 5.4 Melete landing
- `GET /api/melete/today` gains, per subject: `coverage`, `mastery`, `syllabus_status`, `target_level`, `due_today`, `seconds_this_week`.
- `MeleteToday` becomes a list of subject cards (name, level, coverage and mastery as two bars, due today, time this week; "Set up syllabus" when not approved) above a **Review all due** button. Phone-first, one card per row on narrow screens.
- `MeleteSubject` becomes tabs: **Overview** (gap view and next step), **Syllabus** (setup, edit, approve, redraft, Remap all), **Notes** (today's list, plus concepts and off-syllabus flags per note), **Settings** (enrolment, new cards per day, level, intent, goal).
- **Syllabus setup** (status `none`): level picker (four options with a one-line explanation each), optional intent, optional goal, **Draft syllabus**. While `drafting`, a progress state; at `draft`, the editor with **Approve**.

## 6. Themis (ADR 0092)

### 6.1 API (`/api/themis/*`, behind `requireModule( 'themis' )`)
| Route | Does |
| --- | --- |
| `GET /themis/overview?period=week\|month\|quarter` | Everything the home shows (§6.3) |
| `POST /themis/areas`, `PATCH /themis/areas/:id`, `DELETE /themis/areas/:id` | Create, rename, reorder; delete refused unless the area has no goals |
| `POST /themis/goals`, `PATCH /themis/goals/:id`, `DELETE /themis/goals/:id` | Create; edit name, area, target date, status, metric unit/target, cadence, position; delete cascades updates, check-ins and goal-logged time (the UI confirms). The outcome type can't change after creation |
| `GET /themis/goals/:id` | One goal with its history: metric updates, check-ins, time by week, linked subjects |
| `POST /themis/goals/:id/metric` | `{ value, note? }`; metric goals only |
| `POST /themis/goals/:id/checkins` | `{ period_start, rating, note? }`; check-in goals only; `period_start` must be the period currently due |
| `PUT /themis/goals/:id/subjects` | `{ subject_ids }`: sets `melete_subjects.goal_id`; needs Melete; a subject links to at most one goal |

Contracts in `packages/shared/src/themis.ts`. Goal and area names are user content: never logged (ADR 0049).

### 6.2 Periods and check-ins (`themis/periods.ts`, pure)
- Week = Monday–Sunday; month and quarter = calendar (quarters from January). Days are study days (§2.2).
- **Check-in due:** for an active check-in goal, the period just finished (last week for weekly, last month for monthly) is due from the first day of the current period, if the goal existed before that period ended and no check-in for it exists. When the next period starts, the older one is no longer due (missed periods are gaps, not a backlog).

### 6.3 Overview
- `checkins_due`: goal id, name, area, the period it covers.
- `areas`: in order, each with `seconds` for the period split into `measured` and `logged`, and its active goals.
- Goal card data:
  - name, target date, `seconds` (measured and logged) for the period;
  - outcome: **learning** = coverage and mastery pooled over all concepts of the linked approved subjects; **metric** = latest value, target, unit, and the last 8 updates; **check-in** = the last 8 ratings;
  - linked subjects (id, name).
- **Goal time** = entries logged against the goal + all entries of its linked subjects. A subject's history follows its current link: relinking moves its past time with it (accepted for 1.1).
- **Area time** = sum of its goals' time. Time on a subject linked to no goal isn't in Themis.
- Achieved and dropped goals are left out of `areas` but keep their history (reachable from an **All goals** list).

### 6.4 Web
- Routes `/themis` (home) and `/themis/goals/:goalId`. Drawer order **Themis, Mnemosyne, Melete**: `moduleHome.ts` puts `themis: '/themis'` first, so users with Themis land there.
- **Home:**
  - check-ins due as compact cards with five rating buttons and an optional note, answered in place;
  - "Where your time went": a period toggle and one horizontal bar per area, measured and logged as two shades, hours and minutes as text. Built from MUI `Box`/`LinearProgress`, no chart library;
  - goal cards grouped under area headings;
  - **Log time** as a floating action button.
- **Empty state:** "Add your first area" with an inline form. No built-in areas.
- **Dialogs:** area (name), goal (name, area, outcome type with its fields, target date), metric update, link subjects. Goal detail shows history as simple lists and per-week time bars.

## 7. Time (ADR 0091)

### 7.1 Measured sessions
- In the same transaction as `recordReview` (each saved answer), `time.service.recordAnswerTime( userId, subjectId, at )`:
  1. find the user's latest `measured` entry for the subject with `ended_at` ≥ `at − gap`;
  2. if found: `ended_at = at`; else insert one with `started_at = ended_at = at`, `day` = study day of `at`;
  3. `seconds = ( ended_at − started_at ) + finalCredit`.
- `gap` = setting `melete_session_gap_minutes` (default 5); `finalCredit` = `melete_final_card_seconds` (default 30).
- A session keeps the `day` it started on.
- Measured entries can't be edited or deleted through the API.

### 7.2 Logged time
- `POST /api/time-entries { subject_id | goal_id, day, minutes, note? }`; `PATCH` and `DELETE /api/time-entries/:id` for `logged` entries only. `GET /api/time-entries?from&to` lists the user's entries.
- `minutes` 1–1440; `day` not in the future and not more than 365 days back.
- A subject needs the Melete module and a goal needs Themis, both the user's own.
- **Log time dialog** (shared component, from Melete subject pages and the Themis button): target picker (subjects and active goals, grouped), minutes with quick chips (15/30/45/60/90), day (today by default), note. Phone-first.

### 7.3 Week figure on Melete
`seconds_this_week` per subject = its measured and logged entries for the current Monday–Sunday week.

## 8. Settings, usage and Status
- **Per-user settings:** `melete_syllabus_model`, `melete_map_model`, `melete_suggest_model`, `melete_mastery_days` (7–90), `melete_session_gap_minutes` (1–30), `melete_final_card_seconds` (0–120). Validation and the shared `SettingsResponse` updated; Melete settings tab shows the last three.
- **Usage:** all new calls are `melete_runs`, so `usage_events` and the admin's totals already include them. No view change.
- **Admin:** `ModuleId` gains `themis`; the module toggles list it.
- **Status:** no change; Melete work has no health row (§4.4). On startup, notes left `mapping` by a restart go back to `queued`, and the loop picks up subjects still `drafting` (the loop's draft queue is subjects with that status). **Check** how an interrupted `generating` note is recovered today and do the same; note it in the log.

## 9. Testing and release
- **Server:** Vitest and Supertest, test-first. Claude calls go through the existing fake client in unit tests. Pure modules (`mastery.ts`, `periods.ts`, the syllabus diff, ref mapping, session extension) get table tests.
- **Migrations:** `database.upgrade.test.ts` cases for 15 (from `schema-14.sql`) and 16 (from `schema-15.sql`); `schema-15.sql` and `schema-16.sql` added; both migrations locked with `migrations:lock` in the last phase, before `release.sh 1.1.0`.
- **Web:** component tests with the existing Testing Library setup; `test:browser` for the syllabus editor's reordering and the Log time dialog.
- **E2E:** the Anthropic fake gains responses for syllabus, extended generate, map and suggest. Two new specs:
  1. Melete subject: set level → draft → approve → enrolled note mapped → coverage shows → suggestions show without links → a review adds measured time;
  2. Themis: add area and goal → link the subject → log time → home shows both shades → answer a check-in.
- No test touches the network, Claude, Gemini or a real vault.
- **Docs:** `docs/architecture.md`, `apps/server/CLAUDE.md` and `apps/web/CLAUDE.md` updated in the same commits as the parts they describe.
- **Deploy:** `release.sh 1.1.0` and `deploy.sh 1.1.0` (schema 14 → 16). The rollback with `--restore-pre-migration` works as rehearsed in 0.11.

## 10. Release notes outline
- Melete: subjects with a target level, Claude-drafted syllabi, concept mapping, coverage and mastery, the gap view and resource suggestions; the new landing page.
- Time: measured from answers, logged by hand.
- Themis: areas, goals, outcomes, check-ins, the home view; Themis first in the drawer.
- New settings and prompts.
- Migrations 15 and 16.
