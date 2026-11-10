# Tasks — Atlas v1.2.0

Built from `prd.md` and `trd.md` in this folder. Tasks run strictly in order. Each one is test-first (ADR 0007) and ends in its own commit.

**Branch:** `release/1.2.0`. Never commit to `main`, never merge, never tag.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done (tests green, committed, pushed) · ⏸️ Deferred
**Plan:** ⬜ Not approved · ✅ Approved (the link points to the saved plan)

## How this file works
- **Start of a checkpoint:** in plan mode, write one plan for every task in it (files to touch, tests to write first, expected red → green path), then stop. When Naresh approves it, save the plan to the linked file, tick the Plan cell, commit, push.
- **During a checkpoint:** work through its tasks without stopping. For each task:
  1. failing tests first → green → refactor;
  2. `pnpm gate --only <folders it touched>` green;
  3. tick Status and add a log line at the bottom;
  4. commit, then push.
- **Commits** are conventional, with no scope: `feat: …`, `fix: …`, `refactor: …`, `docs: …`, `test: …`, `chore: …`. The subject names the change; the task id lives here.
- **End of a checkpoint:** run `pnpm gate` and `pnpm e2e`, then stop and report:
  - what was built, with commit hashes;
  - the gate's table and the e2e result;
  - anything deferred;
  - any ADR that changes the TRD.

  Don't start the next checkpoint until Naresh says so. (Checkpoint A reports per folder for task 1.1, before the gate exists.)
- Never start a task whose checkpoint Plan cell is ⬜.
- Not covered by the PRD, TRD or an ADR? Stop and ask. Record the decision as the next ADR (from 0110) and add its number to the task's ADR column.
- **Behaviour-neutral means behaviour-neutral.** Tasks marked *(neutral)* must not change what any endpoint returns or any page shows. Existing tests pass unchanged except imports; list any other change in the log line.
- **Data (ADRs 0084, 0085):** each migration is written test-first against the seed of the schema it starts from, and locked only in task 6.3. Nothing resets or hand-edits the VM's database.
- **No test touches the network, Claude, Gemini, Google, Obsidian or a real vault.** The VM is Naresh's: Claude Code never runs a command against the VM, GCP or the bucket.
- **Logs:** IDs and paths only, never note text, goal names or calendar event titles (ADR 0049).
- Update `docs/architecture.md` and the app `CLAUDE.md` files in the same commit as the part they describe.

---

## Checkpoint A: Kick-off
**Plan:** ✅ [`plans/checkpoint-a.md`](plans/checkpoint-a.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 1.1 | Version 1.2.0 in every `package.json`, `apps/agent/pyproject.toml` and its `uv.lock` entry; `docs/README.md` lists v1.2.0 with this folder's docs and ADRs 0103–0109; ADR 0043 status "Hand-mirror clause superseded by 0104", ADR 0055 "Narrowed by 0103"; `nameGuard.test.mjs` `HISTORY` gains `docs/v1.2.0/` and ADRs 0103–0109 (TRD §3.1a); commit this folder's docs and the ADRs | | ✅ |
| 1.2 | Gate (TRD §3.1): `scripts/gate.mjs` without the contract step, `scripts/gate.test.mjs` first; root `gate` and `test` scripts; root `CLAUDE.md` "Before you stop" names the gate | 0106 | ✅ |
| 1.3 | `@anthropic-ai/sdk` 1.x (TRD §3.2): migration guide read first, types fixed, gate green for server; `test:integration` run once by hand, result in the log | 0107 | ✅ |

**Checkpoint A done when:** `pnpm gate` runs every step and prints its table, and the server runs on SDK 1.x.

---

## Checkpoint B: Agent contract and runner
**Plan:** ✅ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 2.1 | *(neutral)* Pydantic `LinkResponse` as a discriminated union on `outcome`, `LinkUsage` → `AgentUsage`; JSON on the wire identical; export regenerated; golden examples pass (TRD §4.2 step 1) | 0104 | ✅ |
| 2.2 | Generator `packages/shared/scripts/generateAgentContract.ts` with table tests; `agent.generated.ts` committed; `agent.ts` re-exports it, hand schemas deleted; contract step added to the gate; root and agent `CLAUDE.md` contract lines updated (TRD §4.2 steps 2–6) | 0104 | ⬜ |
| 2.3 | *(neutral)* `runner.py` and `vault/toolset.py` with their own tests first; linker moved onto them; `tests/linker/test_loop.py` unchanged apart from imports (TRD §4.3) | 0105 | ⬜ |
| 2.4 | Moving cache breakpoint in the runner, tested on the request the fake client receives (TRD §4.3) | 0105 | ⬜ |
| 2.5 | `docs/architecture.md`: the placement rule and table (ADR 0103), the runner and the generated contract | 0103 | ⬜ |

**Checkpoint B done when:** the linker behaves exactly as before on the runner, and changing a Pydantic contract model regenerates Zod with no hand edits.

---

## Checkpoint C: Syllabus agent
**Plan:** ⬜ [`plans/checkpoint-c.md`](plans/checkpoint-c.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 3.1 | Agent: `contract/syllabus.py`, export, golden examples, generated Zod (TRD §4.4) | 0105 | ⬜ |
| 3.2 | Agent: `syllabus/instructions.py` (locked text moved verbatim plus the reading section), `syllabus/run.py`, `SYLLABUS_*` config, `POST /v1/syllabus` and `GET /v1/syllabus/instructions` behind the secret (TRD §4.4) | 0105 | ⬜ |
| 3.3 | Server: migration 18 test-first against `schema-17.sql`, not locked; `recordMeleteRun` takes `turns` and `tool_calls` (TRD §2.1) | 0085, 0105 | ⬜ |
| 3.4 | Server: agent client `draftSyllabusWithAgent` and `fetchSyllabusInstructions`, `AGENT_SYLLABUS_TIMEOUT_MS`; `draftForSubject` calls the agent; old path deleted (list deleted tests in the log); Settings shows the syllabus locked text from the agent (TRD §4.5) | 0105 | ⬜ |
| 3.5 | E2E: the Anthropic fake scripts a tool-use syllabus run; the existing syllabus spec passes against the real agent container (TRD §8) | 0105 | ⬜ |

**Checkpoint C done when:** drafting a syllabus runs the agent over the subject folder, a down agent fails the draft visibly with the old syllabus kept, and e2e passes.

---

## Checkpoint D: Calendar backend
**Plan:** ⬜ [`plans/checkpoint-d.md`](plans/checkpoint-d.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 4.1 | *(neutral)* `tokenCipher` and the OAuth state store move to `google/`; Gmail tests unchanged apart from imports (TRD §5.1) | 0108 | ⬜ |
| 4.2 | Migration 19 test-first against `schema-18.sql` (write `schema-18.sql` first), not locked; `TimeSource` gains `calendar` (TRD §2.2, §5.7) | 0085, 0108 | ⬜ |
| 4.3 | `@googleapis/calendar`; `calendar/auth.ts`; config `CALENDAR_REDIRECT_URI`, `CALENDAR_LOOKBACK_DAYS`, test-only `CALENDAR_API_BASE_URL`; routes for status, connect, callback, calendars, selection, disconnect; `calendar_connection` health (TRD §5.2) | 0108 | ⬜ |
| 4.4 | Pure `calendar/rules.ts`; rules routes; reapply on change (TRD §5.4) | 0108 | ⬜ |
| 4.5 | Sync service with a fake Calendar client; `POST /api/calendar/sync?if_older_than=` (TRD §5.3) | 0108 | ⬜ |
| 4.6 | Pure `calendar/overlap.ts`; drafts list, edit, approve, approve-matched, dismiss; `calendar` entries editable through `/api/time-entries` (TRD §5.5–5.6) | 0108 | ⬜ |
| 4.7 | Themis and Melete numbers count `calendar`; overview gains `calendar_drafts` and `calendar_status` (TRD §5.7) | 0108 | ⬜ |

**Checkpoint D done when:** through the API, a fake calendar's events become drafts, rules assign them, approval stores time with overlaps subtracted, and the overview shows calendar time.

---

## Checkpoint E: Home and calendar UI
**Plan:** ⬜ [`plans/checkpoint-e.md`](plans/checkpoint-e.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 5.1 | Routes: `HomePage` → `TranscriberHome` at `/transcriber`, `/jobs/:id` redirect, internal links updated; Home index route for users with Themis; `homeFor`, drawer order, `start_url` (TRD §6.1) | 0109 | ⬜ |
| 5.2 | `features/home`: `HomeScreen`, `TimeOverviewCard` (three shades), `CalendarDraftsCard`, `ConnectCalendarPrompt`, sync on open (TRD §6.2) | 0109 | ⬜ |
| 5.3 | Settings › Sources: Calendar section (TRD §6.3) | 0108 | ⬜ |
| 5.4 | `/themis/calendar`: Drafts and Rules tabs, "make a rule", link from the Themis home; `test:browser` for the drafts list on a phone (TRD §6.4) | 0108 | ⬜ |

**Checkpoint E done when:** a user with Themis lands on Home, sees time by area with calendar time, reviews and approves drafts on a phone, and the transcriber works at its new path.

---

## Checkpoint F: Release
**Plan:** ⬜ [`plans/checkpoint-f.md`](plans/checkpoint-f.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 6.1 | E2E: Calendar fake in the fakes server; `home-calendar.spec.ts` (TRD §8) | 0108, 0109 | ⬜ |
| 6.2 | Docs: `architecture.md` final pass, `google-cloud-setup.md` (Calendar API, scopes, redirect, Testing-mode expiry), `configuration.md`, `.env.example` files, `docs/v1.2.0/release-notes.md` from TRD §11 | | ⬜ |
| 6.3 | `fixtures/schema-19.sql` (TRD §10); lock migrations 18 and 19; upgrade tests from 17 and 18 green | 0085 | ⬜ |
| 6.4 | **Naresh:** `release.sh 1.2.0`, `deploy.sh 1.2.0` on the release branch, check on the VM, merge, tag; restore drill to a throwaway VM and runbook fixes (TRD §9) | | ⬜ |

**Checkpoint F done when:** `pnpm gate` and `pnpm e2e` are green, migrations are locked, and the release notes are written. 6.4 is Naresh's.

---

## Deferred

## Log
_(one line per ticked task: id, commit hash, moved or deleted test files)_
- 1.1: version 1.2.0 everywhere, docs index lists v1.2.0 and ADRs 0103–0109, ADR 0043/0055 statuses, nameGuard HISTORY extended. No test files moved or deleted. Root scripts/deploy 123 pass; agent 283 pass, ruff clean; typecheck clean in all five folders.
- 1.2: gate (`scripts/gate.mjs`, `scripts/gate.test.mjs`), root `gate` and `test` scripts, CLAUDE.md "Before you stop", README test lines. No test files moved or deleted. `pnpm gate`: 17 steps pass.
- 1.3: `@anthropic-ai/sdk` ^0.137.0 → ^1.6.0, no code changes needed (typecheck, lint, unit tests green). Bumped to 1.6.0, not 1.7.0: 1.7.0 was under a day old and pnpm's minimumReleaseAge refused it; the waiver pnpm added to `pnpm-workspace.yaml` was removed. Move to 1.7 in a later task once it passes the age gate; no ADR needed. The migration guide lists breaks beyond ADR 0107's three (document blocks in assistant messages, citations in user messages, tool-runner compaction, Text Completions, `betas` on Models, X-Api-Key proxies, one credential per client); checked by grep against the server and the e2e fakes, none are used. `test:integration` run by Naresh: 3 passed (summary, generateQuestions, gradeAnswer). Proceeding past the stop-and-ask was right. No test files moved or deleted.
- 2.1: `LinkResponse` is now a `RootModel` over a union on `outcome` (`LinkedResponse` with `reason: None`, `FailedLinkResponse` with `reason` min 1 and `suggestions` max 0); `run_linker` returns the union member, so `LinkResponse` is for validation and the schema only. `LinkUsage` → `AgentUsage`. Wire JSON identical (`reason: null` kept, key order kept); exported schema emits `{ "type": "null" }` for the linked `reason`, which the TRD asked for, so the 2.2 generator must map `type: null` to `z.null()`. Two test lines changed beyond imports: `test_link_route.py` and `test_loop.py:278` read `.root` after `LinkResponse.model_validate`. No test files moved or deleted. `pnpm gate --only agent` 287 pass.
