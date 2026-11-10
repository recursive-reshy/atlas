# Atlas v1.2.0 — Technical Requirements

Built from `prd.md` in this folder. Decided with Naresh on 2026-11-10; ADRs 0103–0109.

## 1. Changes at a glance
| Area | Change | ADR |
| --- | --- | --- |
| Gate | `scripts/gate.mjs` runs every test, lint, typecheck and contract step and reports all failures | 0106 |
| Dependency | `@anthropic-ai/sdk` 0.137 → 1.x (API version 2026-10-21) | 0107 |
| Placement rule | Single bounded input → Express; model decides what to read → agent service | 0103 |
| Agent contract | Zod mirror generated in-repo from the JSON Schema; linker response becomes a discriminated union | 0104 |
| Agent runner | Generic `run_agent` and rooted vault toolset; linker refactored onto it; moving cache breakpoint | 0105 |
| Syllabus | `POST /v1/syllabus` agent over the subject folder; Express path removed; migration 18 | 0105 |
| Calendar | Read-only Google Calendar grant, manual sync into reviewed drafts, rules, overlap subtraction; migration 19 | 0108 |
| Home | New landing page at `/`; the transcriber moves to `/transcriber`; PWA opens `/` | 0109 |
| Ops | Restore drill to a throwaway VM (Naresh) | — |

## 2. Migrations
Both follow ADRs 0084, 0085 and 0099 and the root `CLAUDE.md` database rule: a SQL file in `apps/server/src/repositories/sql/`, appended to `migrationFiles`, written test-first against the seed of the schema it starts from, locked at the end of the release (§10).

### 2.1 Migration 18 — agent run columns (stored schema 18, seed `schema-17.sql`)
```sql
ALTER TABLE melete_runs ADD COLUMN turns INTEGER;
ALTER TABLE melete_runs ADD COLUMN tool_calls INTEGER;
```
Existing rows read back `NULL`. No rows added or removed.

### 2.2 Migration 19 — calendar and time (stored schema 19, seed `schema-18.sql`)
**`time_entries` rebuild.** SQLite can't alter a `CHECK`, so: create `time_entries_new` with the changes below, copy every row, drop the old table, rename, recreate `time_entries_day` and `time_entries_open`. If a view names `time_entries`, drop and recreate it around the rebuild (as migration 16 did for `eligible_users`).
```sql
source TEXT NOT NULL CHECK ( source IN ( 'measured', 'logged', 'calendar' ) ),
-- unchanged: exactly one of subject_id, goal_id
CHECK ( source IN ( 'logged', 'calendar' ) OR subject_id IS NOT NULL )
```
All other columns are unchanged.

**New tables.**
```sql
CREATE TABLE calendar_account (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES users ( id ) ON DELETE CASCADE,
  email TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  connected_at TEXT NOT NULL,
  calendar_id TEXT,
  calendar_name TEXT,
  import_from TEXT,
  last_synced_at TEXT
);

CREATE TABLE calendar_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  phrase TEXT NOT NULL,
  subject_id TEXT REFERENCES melete_subjects ( id ) ON DELETE CASCADE,
  goal_id TEXT REFERENCES themis_goals ( id ) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ( ( subject_id IS NULL ) <> ( goal_id IS NULL ) )
);
CREATE INDEX calendar_rules_user ON calendar_rules ( user_id, position );

CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  day TEXT NOT NULL,
  seconds INTEGER NOT NULL CHECK ( seconds > 0 ),
  status TEXT NOT NULL CHECK ( status IN ( 'draft', 'approved', 'dismissed' ) ),
  subject_id TEXT REFERENCES melete_subjects ( id ) ON DELETE SET NULL,
  goal_id TEXT REFERENCES themis_goals ( id ) ON DELETE SET NULL,
  assigned_by TEXT CHECK ( assigned_by IN ( 'rule', 'hand' ) ),
  rule_id TEXT REFERENCES calendar_rules ( id ) ON DELETE SET NULL,
  note TEXT,
  time_entry_id TEXT REFERENCES time_entries ( id ) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE ( user_id, calendar_id, event_id ),
  CHECK ( subject_id IS NULL OR goal_id IS NULL )
);
CREATE INDEX calendar_events_status ON calendar_events ( user_id, status, day );
```
Upgrade test: every `time_entries` row survives with identical values; the new tables are empty. No `ALLOWED_COUNT_CHANGES` entry.

## 3. Kick-off (ADRs 0106, 0107)

### 3.1 Gate (`scripts/gate.mjs`)
- Steps as listed in ADR 0106, each a `{ folder, name, command, args, kind }` entry (`kind`: `test`, `lint`, `typecheck`, `contract`). Run in order with `child_process.spawn`. Output is captured per step; a step's exit code decides pass or fail.
- Flags: `--only <comma list>` (folder names: `shared`, `server`, `web`, `agent`, `e2e`, `root`; `agent` or `shared` adds `contract`) and `--tests` (kind `test` only).
- Summary table to stdout. Failed steps' output follows it. Exit 1 if any failed.
- The contract step is added in §4.2, when the generator exists; until then the list has no `contract` entry.
- Root `package.json`: `"gate": "node scripts/gate.mjs"`, `"test": "node scripts/gate.mjs --tests"`.
- `scripts/gate.test.mjs` runs the gate's runner against fake steps (pass, fail, pass): all three run, the table lists them, exit 1. The step list is exported so the test can check that every package's `test`, `lint` and `typecheck` script is covered.
- Root `CLAUDE.md` "Before you stop" updated (ADR 0106).

### 3.1a Name guard
`scripts/nameGuard.test.mjs` `HISTORY` gains `docs/v1.2.0/` and ADRs 0103–0109 (they name Mnemosyne as a module), as 1.1 did for its docs.

### 3.2 `@anthropic-ai/sdk` 1.x
- Read the migration guide for API version 2026-10-21 before changing code.
- Bump in `apps/server`. Fix types in `clients/claude.client.ts` and `clients/anthropicModels.client.ts`. Unit tests keep using the existing fake client.
- `pnpm gate --only server,shared` green, then `test:integration` once by hand. Record the result in the log.
- Stop and ask if the guide lists a break beyond sampling parameters, bearer auth and the `MessageParam` union.

## 4. Agent service (ADRs 0103–0105)

### 4.1 Placement ADR
ADR 0103 is committed with this folder. `docs/architecture.md` gains the rule in its agent section (one paragraph and the table). ADR 0055's status gains "Narrowed by 0103".

### 4.2 Generated contract (ADR 0104)
1. **Pydantic first, behaviour-neutral.**
   - `LinkResponse` becomes a discriminated union on `outcome`: `LinkedResponse { outcome: "linked", suggestions, usage }` and `FailedLinkResponse { outcome: "failed", reason: str (min 1), suggestions: list (max 0), usage }`.
   - `reason` stays on the wire as `null` for `linked`, so the JSON is byte-identical: keep the field with `Literal[ None ]` / `None` default. **Check** that the exported schema expresses this; if it can't while keeping the wire identical, stop and ask.
   - `LinkUsage` becomes `AgentUsage` (same fields).
   - Export regenerated; all golden examples still pass on the Python side.
2. **Generator** `packages/shared/scripts/generateAgentContract.ts`:
   - Reads every `apps/agent/schema/*_contract.json`.
   - Writes `src/agent.generated.ts`: a header comment saying it is generated and from which command, `import { z } from 'zod'`, imports for mapped `$ref`s, then one `export const X = …` and `export type X = z.infer< typeof X >` per definition, in dependency order, in the house style.
   - Supported keywords per ADR 0104. Anything else throws with the keyword and JSON path.
   - `$ref` map: `VaultDir` → `./auth.js`. Extend the map rather than duplicating a shape.
   - Script `"generate:agent": "tsx scripts/generateAgentContract.ts"` in `packages/shared`.
   - Table tests for each keyword, the unsupported-keyword error, and dependency ordering.
3. **Swap.** `src/agent.ts` re-exports from `agent.generated.ts`. The hand-written schemas and the `superRefine` are deleted. The Zod golden-example test passes unchanged.
4. **Gate contract step:** runs the agent's export (`uv run python -m atlas_agent.contract.export`) and `generate:agent`, then `git diff --exit-code` on `apps/agent/schema/` and `packages/shared/src/agent.generated.ts`.
5. Root `CLAUDE.md` contract exception line and `apps/agent/CLAUDE.md` updated: "generated by `pnpm --filter @atlas/shared generate:agent`; never edit by hand".
6. ESLint: the generated file is linted like any other (it is written in the house style), not ignored.

### 4.3 Runner (ADR 0105)
- `atlas_agent/runner.py`:
  - `Limits` model: `max_turns`, `max_tool_calls`, `max_output_tokens`, `timeout_seconds`.
  - `AgentTool`: `definition: ToolDefinition`, `run: Callable[ [ dict[ str, Any ] ], ToolResult ]`.
  - `AgentSpec[ SubmitT ]`: `system_text`, `first_message`, `model`, `tools`, `submit_name`, `submit_model: type[ SubmitT ]`, `limits`.
  - `AgentOutcome( StrEnum )`: `SUBMITTED`, `FAILED`.
  - `AgentRun[ SubmitT ]`: `outcome`, `submission: SubmitT | None`, `reason: str | None`, `usage: AgentUsage`.
- `run_agent( spec, claude ) -> AgentRun`: the body of today's `converse` and `run_linker`, generalised. Limit, timeout, nudge and validation messages keep their wording.
- **Moving cache breakpoint:** after each turn, the newest user message's last content block gets `cache_control`, and the previous one's is removed (at most 4 breakpoints in total: system, tools, latest message). Covered by a test on the request the fake client receives.
- `atlas_agent/vault/toolset.py`: `vault_tools( root, settings, include ) -> list[ AgentTool ]`, moving the bodies of `build_tool_definitions` and `run_vault_tool`. Paths are relative to `root`, and the existing `paths.py` checks keep everything inside it.
- `linker/loop.py` shrinks to: build the spec, `run_agent`, `apply_checks` on `SUBMITTED`, build `LinkResponse`.
- **Order:** the refactor lands with `tests/linker/test_loop.py` unchanged apart from imports. Runner and toolset get their own tests, written before the move.

### 4.4 Syllabus agent (ADR 0105)
- `contract/syllabus.py`:
  - `SyllabusRequest { vault_dir, subject_folder, name (1–200), level: TargetLevel, intent: str | None (≤ 2000), model, guidance (≤ 20 000) }`.
  - `TargetLevel` enum: `awareness | working | proficient | expert`.
  - `subject_folder`: relative, no `..`, no leading `/`, same validation style as `vault_dir`.
  - `SyllabusResponse`: a union of `Drafted { outcome: "drafted", sections, usage }` and `Failed { outcome: "failed", reason, usage }`.
  - `sections`: list of `{ name (≤ 200), concepts: list[ { name (1–200), description (≤ 500) } ] }`. Section count ≤ 20, concepts per response ≤ 100. The 80 cap and dedupe are Express's.
  - Export to `schema/syllabus_contract.json`; golden examples valid and invalid (empty name, `..` in folder, drafted with a reason, failed without one).
- `syllabus/instructions.py`:
  - The locked text from `apps/server/src/melete/prompts.ts` (`LOCKED_INSTRUCTIONS_MELETE_SYLLABUS`), moved verbatim, including the untrusted-content sentence from 1.1.1.
  - Plus a "How to read the folder" section.
  - Plus the closing line that guidance follows and the rules above win.
- `syllabus/run.py`:
  - `vault_for( settings, vault_dir )`, then resolve `subject_folder` inside it. A folder that doesn't exist is `failed` "Subject folder not found".
  - Tools: `vault_tools( subject_root, settings, include = [ "list_notes", "search_vault", "read_note" ] )`.
  - Submit tool `submit_syllabus`, model `SubmitSyllabus { sections }`.
  - First message: subject, level label, intent, then a line that the notes are reached through the tools.
- `main.py`:
  - `POST /v1/syllabus` and `GET /v1/syllabus/instructions`, behind the shared secret like `/v1/link`.
  - Config `syllabus_max_turns = 16`, `syllabus_max_tool_calls = 40`, `syllabus_max_output_tokens = 8192`, `syllabus_timeout_seconds = 180` (env `SYLLABUS_*`).
  - The linker's settings keep their names.

### 4.5 Express side
- Migration 18 (§2.1). `recordMeleteRun` takes optional `turns` and `tool_calls`.
- `clients/agent.client.ts`:
  - `draftSyllabusWithAgent( request )` posts to `/v1/syllabus` with `AGENT_SYLLABUS_TIMEOUT_MS` (config, default 200 000, positive int) and parses with the generated schema.
  - `fetchSyllabusInstructions()`.
  - A network error or timeout throws `AgentUnavailableError`.
- `services/meleteSyllabus.service.ts` `draftForSubject`:
  - Resolves the vault dir, the subject's folder relative to the vault, model and guidance as today.
  - Calls the agent. On `drafted`, runs `processSyllabus` and stores as today, recording the run with tokens, cost, turns and tool calls.
  - On `failed`, calls `failDraft` with the agent's reason. On `AgentUnavailableError`, calls `failDraft` with "Agent service unavailable".
  - Cost is computed from `AgentUsage` with the existing price table, cache reads and writes included, as for link runs.
- Delete:
  - From `melete/syllabus.ts`: `MAX_SYLLABUS_NOTES`, `NOTE_OPENING_CHARACTERS`, `noteOpening`, `buildSyllabusUser`.
  - `readNotes` in the service, `draftSyllabus` in `claude.client.ts`, and `LOCKED_INSTRUCTIONS_MELETE_SYLLABUS` in `melete/prompts.ts`.
  - Their tests go too; list them in the log.
- Settings: `getLockedInstructions` no longer has `melete_syllabus`. The agent-status block gains `syllabus_locked_instructions`, fetched like the linker's, with the same `not_configured`, `unavailable` and `ok` states. The Prompts tab shows it for the `melete_syllabus` purpose.
- `docs/architecture.md`, `apps/server/CLAUDE.md`, `apps/agent/CLAUDE.md` and `.env.example` (`AGENT_SYLLABUS_TIMEOUT_MS`, `SYLLABUS_*`) updated in the same commits.

## 5. Calendar (ADR 0108)

### 5.1 Shared Google plumbing (behaviour-neutral)
`gmail/tokenCipher.ts` → `google/tokenCipher.ts`, and the OAuth state store (state create, check, expiry, cap) → `google/oauthState.ts`. Gmail imports them; its tests pass unchanged apart from imports.

### 5.2 Connection
- Dependency `@googleapis/calendar` (latest; pin like `@googleapis/gmail`).
- `calendar/auth.ts`, same shape as `gmail/auth.ts`:
  - `SCOPES = [ 'https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly' ]`.
  - Its own error classes and messages (`Calendar isn't configured`, `Calendar isn't connected`, revoked or Testing-mode expiry).
- Config `CALENDAR_REDIRECT_URI` (optional; the feature is "not configured" without it, as Gmail is). Test-only `CALENDAR_API_BASE_URL` for the e2e fake, refused outside `NODE_ENV=test` like `FETCH_ALLOW_PRIVATE`.
- Routes, under `requireModule( 'themis' )`:
  - `GET /api/calendar` → `{ status: 'not_configured' | 'not_connected' | 'connected' | 'broken', email?, calendar?: { id, name }, import_from?, last_synced_at?, error? }`.
  - `POST /api/calendar/connect` → `{ url }` (consent URL).
  - `GET /api/calendar/oauth/callback` → stores the encrypted token and redirects to `/settings/sources?calendar=choose`.
  - `GET /api/calendar/calendars` → the user's calendars `{ id, name, primary }`.
  - `PUT /api/calendar/selection { calendar_id, import_from }`. `import_from` is a day, not in the future, not more than 365 days back; the default in the UI is this week's Monday.
  - `DELETE /api/calendar?remove_time=true|false`. Disconnect deletes the account row. With `remove_time`, it also deletes `calendar_events` and `calendar` time entries for that calendar.
- Changing calendar = `PUT /selection` with a new id. Drafts of the old calendar are deleted; its approved entries and markers stay.
- Health: a `calendar_connection` row per user via `recordCheck`, updated on every sync and on connect or refuse. Shown in Status like Gmail.

### 5.3 Sync
- `services/calendarSync.service.ts` `syncCalendar( userId, now )`:
  1. Needs a connected account with a calendar selected; otherwise 409.
  2. Window: `from = max( import_from, now − CALENDAR_LOOKBACK_DAYS )` (config, default 14, 1–90), `to = now`.
  3. Read every page of `events.list( calendarId, timeMin = from, timeMax = to, singleEvents = true, showDeleted = false )`. Any error ends the sync with nothing changed, and records the health check.
  4. Keep events with `start.dateTime` and `end.dateTime`, `end ≤ now`, and `seconds > 0`. All-day events are skipped.
  5. Reconcile in one transaction against `calendar_events` for this user and calendar whose `started_at` is in the window:
     - **unknown event** → insert `draft` and apply rules;
     - **known `draft`** whose title or times changed → update; if the title changed and `assigned_by` is not `hand`, re-apply rules;
     - **`draft` no longer returned** → delete;
     - **`approved` and `dismissed`** rows are never touched.
  6. Set `last_synced_at`. Return `{ added, updated, removed, drafts }`.
- `day` = the study day of `started_at` (the same `dayOf` as other time entries). `seconds` = end − start.
- `POST /api/calendar/sync?if_older_than=300`: skips and returns the current counts when `last_synced_at` is younger than the given seconds. Without the parameter it always syncs.
- Events are read with the title (`summary`, empty string when missing); nothing else of the event is stored.

### 5.4 Rules
- `calendar/rules.ts`, pure: `matchRule( title, rules )`, case-insensitive `includes`, first by `position`.
- Routes:
  - `GET /api/calendar/rules`
  - `POST { phrase (1–100), subject_id | goal_id }`
  - `PATCH /:id { phrase?, subject_id? | goal_id?, position? }` (a `position` move renumbers, as for Themis areas)
  - `DELETE /:id`
- Targets must be the user's own; a subject needs Melete, a goal needs Themis (404 otherwise, as in 1.1).
- Every rule change reapplies rules to this user's drafts where `assigned_by` is null or `rule`, in the same transaction.

### 5.5 Drafts and approval
- `GET /api/calendar/drafts` → drafts newest first. Each draft has its event fields, assignment, `assigned_by`, the rule's phrase, and `overlap_seconds` / `counts_seconds` (§5.6) computed on read.
- `PATCH /api/calendar/drafts/:id { subject_id? | goal_id?, started_at?, ended_at?, note? }`:
  - A changed assignment sets `assigned_by = 'hand'`.
  - Changed times recompute `seconds` and `day`. The end must be after the start, and both must be in the past.
- `POST /api/calendar/drafts/:id/approve`:
  - 409 without an assignment.
  - In one transaction: compute `counts_seconds`; if > 0, insert `time_entries { source: 'calendar', subject_id | goal_id, day, started_at, ended_at, seconds: counts_seconds, note }`; set `status = 'approved'` and `time_entry_id` (null when nothing was recorded).
- `POST /api/calendar/drafts/approve-matched` approves every draft with `assigned_by = 'rule'`, each as above, and returns `{ approved }`.
- `POST /api/calendar/drafts/:id/dismiss` sets `status = 'dismissed'`.
- Time entries with source `calendar` are edited and deleted through `/api/time-entries` like `logged` ones: `PATCH` allows `subject_id | goal_id`, `day`, `minutes` and `note`; `DELETE` leaves the `calendar_events` row `approved` with `time_entry_id` null. `measured` stays read-only.

### 5.6 Overlap (pure, `calendar/overlap.ts`)
- `measuredOverlap( window, entries ) -> seconds`: the union of the parts of measured `[ started_at, ended_at ]` intervals that fall inside the event window. Overlapping measured entries are not double-subtracted.
- Entries considered:
  - assigned to a subject → measured entries of that subject;
  - assigned to a goal → measured entries of every subject with `goal_id` = that goal.
- `counts_seconds = seconds − overlap`.
- Table tests: no overlap, partial, full, two measured entries overlapping each other, a measured entry spanning the whole event.

### 5.7 Themis numbers
- `TimeSource` gains `calendar`. Every place that splits time by source (`themis.ts` time breakdown, goal and area rollups, `time_by_week`) gains a `calendar` field; `seconds` stays the sum.
- `GET /api/themis/overview` gains `calendar_drafts: number` (0 when not connected) and `calendar_status` (the §5.2 status, for the Home prompt).
- Melete `seconds_this_week` counts calendar entries against the subject too.

## 6. Home and web (ADR 0109)

### 6.1 Routes and drawer
- Transcriber (labelled Mnemosyne in the drawer):
  - `HomePage` → `TranscriberHome` (file and component).
  - Routes `transcriber` and `transcriber/jobs/:id` under `RequireModule module="transcriber"`; `jobs/:id` redirects to `transcriber/jobs/:id`.
  - Every internal link to `/` or `/jobs/…` is updated; grep for `to="/"` and `` `/jobs/ ``.
- Home:
  - Index route `HomeScreen` under a guard that requires `themis`. Without Themis, the index redirects to `homeFor( modules )`.
  - `MODULE_HOMES.transcriber = '/transcriber'`. `homeFor` returns `/` when the user has `themis`.
- `NAV_ITEMS`: Home (icon `HomeOutlined`, current on `/` exactly), then Themis, Mnemosyne, Melete. Home shows only with Themis.
- `public/manifest.webmanifest` `start_url` → `/`.
- Paths and names use `transcriber` (ADR 0073); no new "mnemosyne" in code.

### 6.2 Home screen (`features/home/`)
- `HomeScreen` composes cards. Each card is its module's component, exported from that module's feature folder, so `features/home` imports cards and owns no data.
- `TimeOverviewCard` (from `features/themis`): period switch (`?period=week|month|quarter`), time per area as bars split three ways (reuse `TimeBar` with a third shade), top 5 goals by time.
- `CalendarDraftsCard`: "N calendar drafts to review" linking to `/themis/calendar`; hidden at 0 and when not connected.
- `ConnectCalendarPrompt`: shown when `calendar_status` is `not_connected` and not dismissed. Dismissal is stored with `localStorage`, wrapped in try/catch.
- On mount, when connected: `POST /api/calendar/sync?if_older_than=300`, then invalidate `themisKeys.all`. Never blocks rendering.

### 6.3 Calendar in Settings › Sources
A Calendar section beside Gmail:
- not configured;
- **Connect**;
- after consent, choose a calendar and the import start date;
- connected, showing the account, calendar, last sync, **Sync now**, **Change calendar** and **Disconnect** (the dialog offers "also remove imported time");
- broken, with **Reconnect**.

### 6.4 `/themis/calendar`
- Tabs **Drafts** and **Rules** (`?tab=`).
- **Drafts:** a list of rows with date, time range, title, assignment picker (subjects and active goals, grouped, as in the Log time dialog), counts line ("60 min · 25 already measured · counts 35"), note, **Approve** and **Dismiss**. **Sync now** and **Approve all matched (n)** at the top. Phone-first. Opening the tab syncs with `if_older_than=300`.
- **Rules:** a list with phrase, target picker, up/down reorder, delete, and an add row. "Make a rule" on a draft opens the add row pre-filled with the draft's title.
- Themis home links to it from the time section.

## 7. Settings, usage and Status
- **Config:**
  - server: `AGENT_SYLLABUS_TIMEOUT_MS`, `CALENDAR_REDIRECT_URI`, `CALENDAR_LOOKBACK_DAYS`, `CALENDAR_API_BASE_URL` (test only);
  - agent: `SYLLABUS_*`.
  - All are in `.env.example` with comments and checked by `envExample.test.ts`.
- **Usage:** syllabus runs stay `melete_runs`, so the rollups are unchanged. Calendar makes no Claude calls.
- **Status:** a `calendar_connection` row per connected user. The agent check is unchanged.
- **Admin:** no change. Calendar follows the Themis toggle.

## 8. Testing
- No test touches the network, Claude, Gemini, Google or a real vault.
- **Agent:** pytest for runner, toolset, syllabus run (fake client scripted through list → read → submit; submit invalid then valid; folder missing; limits), contract examples, instructions endpoint.
- **Server:**
  - pure tables for `rules.ts`, `overlap.ts`, sync reconciliation (fake Calendar client);
  - routes with Supertest;
  - upgrade tests for 18 and 19;
  - Gmail tests pass unchanged after §5.1.
- **Web:** component tests beside every new file; `test:browser` for the drafts list on a phone and the three-shade time bar in light and dark.
- **E2E:**
  - The Anthropic fake gains a scripted tool-use syllabus run (a `list_notes` call, a `read_note` call, then `submit_syllabus`), so the real agent container runs its loop. The existing syllabus spec runs unchanged against it.
  - The fakes server gains a Calendar API (`calendarList`, `events.list`) behind `CALENDAR_API_BASE_URL`, with the OAuth token step faked as Gmail's would be. If Gmail's consent flow isn't in e2e today, seed a connected `calendar_account` with a token encrypted by the e2e key instead, and note which in the log.
  - New spec `home-calendar.spec.ts`:
    1. Connected calendar with three finished events: one matching a rule, one unmatched, one overlapping a measured Melete session.
    2. Open Home → sync → "3 drafts".
    3. Approve all matched.
    4. Assign and approve the unmatched one.
    5. Approve the overlapping one and see the reduced minutes.
    6. Home shows calendar time in the area bar.
    7. `/jobs/<id>` redirects to `/transcriber/jobs/<id>`.

## 9. Ops: restore drill
Naresh, once, after deploying 1.2.0: restore the Litestream replica to a throwaway VM following `docs/deploy.md` "Restoring the database", start the stack there without public access, check the schema version and a few rows, delete the VM. Corrections to the runbook go in `docs/deploy.md`. Claude Code doesn't run anything against the VM, GCP or the bucket.

## 10. Release
- Lock migrations 18 and 19 (`migrations:lock`) after writing `fixtures/schema-18.sql` (seeded before 19 is written) and `fixtures/schema-19.sql` (with an account, two rules, drafts, an approved and a dismissed event, and a `calendar` time entry), filling every table and passing `foreign_key_check`.
- Docs:
  - `docs/architecture.md` (placement rule, runner, syllabus agent, calendar, Home);
  - `docs/google-cloud-setup.md` (Calendar API, scopes, redirect URI, Testing-mode expiry);
  - `docs/configuration.md` (new variables);
  - `docs/v1.2.0/release-notes.md`.
- `release.sh 1.2.0`, `deploy.sh 1.2.0` (schema 17 → 19) by Naresh; rollback with `--restore-pre-migration` as rehearsed.

## 11. Release notes outline
- Melete: syllabus drafts read the subject's notes (agent), any number of notes.
- Themis: Google Calendar as a time source with reviewed drafts and rules; calendar time in all totals.
- Home: new landing page; Mnemosyne at `/transcriber`; the phone app opens Home.
- Under the hood: placement rule (ADR 0103), generated agent contract, shared agent runner, test gate, Anthropic SDK 1.x (API 2026-10-21).
- Migrations 18 and 19.
