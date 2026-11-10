# Atlas v1.2.0 — Product Requirements

## 1. Summary
v1.2.0 is the "agents" release, with a second track for time. It does three things:
- **The agent service earns its keep.** A written rule decides what goes in the Python agent service and what stays a single Claude call in Express. The agent contract's Zod mirror is generated instead of hand-written, so a new agent endpoint costs a Pydantic change. Melete's syllabus drafting moves into the service as `/v1/syllabus`, a tool-use loop over the subject folder, replacing the "first 300 characters of up to 60 notes" prompt.
- **Google Calendar feeds Themis.** Time Naresh logs in a dedicated calendar (a gym session, a call with family, an evening on a side project) comes into Atlas as drafts he reviews and approves, then counts as Themis time against the right goal.
- **A Home screen.** A new landing page gives a broad view of where the time went, relative to the goals, with room for module cards to join it later.

Around these: the test gate reports every package's result, one major dependency bump, and the restore drill skipped at 0.11.

## 2. Background
Every Claude call added since 0.7 went into Express. Most of them are right there: one note in, one structured answer out. Syllabus drafting is the exception. Express decides what the model sees (`MAX_SYLLABUS_NOTES = 60`, `NOTE_OPENING_CHARACTERS = 300` in `melete/syllabus.ts`), so a subject with 80 notes silently loses 20, and a note whose point is in paragraph three is invisible. It was built that way because adding an agent endpoint means a Pydantic model, a JSON Schema export, golden examples and a hand-written Zod mirror (ADR 0043). 1.2 removes that toll before the idea validator and the Metis advisor arrive.

Themis (1.1) counts two kinds of time: measured (Melete reviews) and logged (typed into Atlas). Everything Naresh does away from Atlas needs a manual log, so most of it isn't logged. He already lives in Google Calendar on his phone.

Decided while scoping (2026-11-10):
- The rule: **single bounded input → one Claude call in Express; the model must decide what to read → agent service.** Read-only isolation and Python-shaped data work are supporting reasons. Written down as an ADR.
- The Zod mirror of the agent contract is generated from the exported JSON Schema.
- Syllabus drafting becomes the agent service's second endpoint. The idea validator and the Metis advisor are not in 1.2.
- Calendar: a **dedicated calendar** chosen by the user. Every finished event in it counts; nothing outside it does. Atlas reads it and never writes to it.
- Events map to goals or subjects through **title rules** the user defines.
- **Manual sync, reviewed drafts:** no background polling. A sync (from a button, or when Home or the review page opens) turns finished events into drafts; nothing counts until approved. Once approved, an entry belongs to Atlas and later calendar edits don't change it.
- Calendar is the third time source, alongside measured and logged. No other sources (fitness trackers, screen time) until it has been used for a few weeks.
- **Home is a separate screen**, above Themis in the drawer, and becomes the landing page. Themis keeps the detailed goals view.
- To-dos (tasks with due dates) are the next release, not 1.2.
- The test gate runs every package even when one fails, as part of the kick-off task.

## 3. Goals
- Adding an agent endpoint is a Pydantic-and-instructions change, with no hand-written mirror.
- A syllabus draft is based on what the subject's notes say, not on a fixed slice of them.
- Time logged in Google Calendar reaches Themis against the right goal after a sync and a quick review, without double counting time Melete already measured.
- Opening Atlas shows where the week's time went across areas, honestly: what was tracked, not an estimate of the rest.
- A failing package in the test gate no longer hides the results of the others.
- The VM upgrades from 1.1.1 to 1.2.0 with all data kept.

## 4. Non-goals
- **No new agents beyond the syllabus.** No idea validator, no Metis advisor, no other Melete call moved out of Express (questions, grading, mapping and resource suggestions stay single calls by the rule).
- **No writing to Google Calendar.** No creating, editing or colour-coding events from Atlas.
- **No background sync.** Atlas never calls Google unless the user syncs or opens Home or the review page.
- **No reading the main calendar.** Only the calendar the user picks.
- **No AI matching of events to goals.** Rules only; Claude suggestions for unmatched drafts are KIV.
- **No to-dos** and no "due today" task list of his own.
- **No time targets** per goal or area (e.g. "5 hours a week on health").
- No change to Mnemosyne, to how FSRS schedules, or to how syllabus mapping, coverage and mastery work once a syllabus exists.

## 5. User flows
1. **Connecting a calendar.** In Settings › Sources, Naresh connects Google Calendar, grants read access, picks the "Atlas" calendar from his list and an import start date (default: start of this week).
2. **Rules.** In Themis › Calendar › Rules he adds rules: title contains "gym" → goal "Get fit" (Health); "DE study" → subject "Data Engineering". Rules apply in his order, first match wins.
3. **Logging.** After the gym, on his phone, he adds "Gym" to the Atlas calendar from 18:00 to 18:40.
4. **Reviewing.** Later he opens Atlas. Home syncs and shows "3 calendar drafts to review". In Themis › Calendar › Drafts, "Gym" is already assigned to "Get fit"; "Call with Mum" matches nothing, so he picks "Time with family" and taps "make a rule"; "DE study 19:00–20:00" shows "60 min · 25 already measured in Melete · counts 35". He taps **Approve all matched**, then approves the other two.
5. **Home.** Home shows time per area for this week (switchable to month and quarter), split by source (measured, logged, calendar), the top goals by time, and drafts waiting.
6. **Drafting a syllabus.** He creates a subject with 80 notes in its folder and asks for a draft. The status shows it is drafting; the agent skims the folder, opens the notes it judges relevant, and submits sections and concepts. He edits and approves as in 1.1.

## 6. Features

### 6.1 Kick-off: test gate and dependency bump
- [ ] The root test command runs every package's tests (server, web, shared, agent) and the `scripts/` and `deploy/` tests even when an earlier one fails, then fails overall if any did, naming which.
- [ ] The gate is written in the root `CLAUDE.md` as an explicit list of commands per folder (tests, lint, typecheck), so a checkpoint report covers every one.
- [ ] One major dependency bump (which one: TRD), as allowed after 1.0 at one per release.

### 6.2 Agent ADR
- [ ] An ADR records the rule in §2, its supporting reasons, and a short checklist of what a new agent endpoint needs.
- [ ] It names where each existing Claude call sits and why, and narrows the v0.8 decision that tutor calls run in Express (syllabus drafting moves; the rest stay).
- [ ] It names the idea validator and the Metis advisor as future agent-service endpoints.

### 6.3 Generated agent contract
- [ ] The Zod mirror in `packages/shared` is generated from the agent's exported JSON Schema; no part of it is hand-written.
- [ ] The test gate fails when the generated file is out of date with the Pydantic models.
- [ ] The golden example payloads stay, and both sides still validate them.
- [ ] The linker contract is unchanged in behaviour: the same requests and responses pass.

### 6.4 Shared agent runner
- [ ] The linker's loop, vault tools, submit-tool pattern, turn and tool-call limits and usage accounting become one reusable runner in the agent service.
- [ ] The linker uses it with no change in behaviour; its existing tests pass.
- [ ] A new agent is a set of instructions, a tool list and a Pydantic submit model.

### 6.5 Syllabus agent (`/v1/syllabus`)
- [ ] Drafting a syllabus calls the agent service. Its tools can list, search and read notes **in the subject's folder only**.
- [ ] Input: subject name, target level, intent, size guidance per level and the hard cap from 1.1. Output: sections of concepts through a submit tool, in the 1.1 shape.
- [ ] With an empty folder, the draft comes from name, level and intent alone, as today.
- [ ] Express keeps its post-checks (dedupe, cap) and stores the result exactly as today; mapping, coverage and mastery are unchanged.
- [ ] The 300-character, 60-note path is removed. If the agent service is down or the run fails, the draft fails visibly and can be retried; there is no fallback to the old path.
- [ ] The locked instructions plus editable guidance and model setting pattern stays (Sonnet by default).
- [ ] Each run records turns, tool calls, tokens and cost, like linker runs, and counts in per-user usage as "syllabus draft".
- [ ] Existing syllabi are untouched unless he redrafts.

### 6.6 Calendar connection
As a user, I want Atlas to read one calendar of mine.
- [ ] Each user with Themis can connect their own Google Calendar from Settings › Sources, separately from sign-in and from Gmail, with read-only access.
- [ ] The token is stored encrypted, as the Gmail token is.
- [ ] The user picks one calendar from their list and an import start date (default: start of this week). The calendar can be changed or disconnected; disconnecting keeps approved time unless they choose to remove it.
- [ ] The Status panel shows the connection's health per user, like Gmail's.

### 6.7 Calendar sync and drafts
- [ ] A sync runs from **Sync now**, and when Home or the review page opens (skipped if the last one was under 5 minutes ago). There is no background polling.
- [ ] A sync reads the last 14 days (never before the import start date) and turns every finished, timed event into a **draft**. Events in progress or in the future wait until they end; all-day events are skipped.
- [ ] Drafts follow the calendar until reviewed: a changed event updates its draft, a deleted one removes it. Approved and dismissed events are never imported again.
- [ ] A draft can be reassigned, its times corrected and a note added, then **approved** or **dismissed**. **Approve all matched** approves every draft a rule assigned. A draft without a goal or subject can't be approved.
- [ ] An approved draft becomes a time entry owned by Atlas: editable or deletable in Atlas, not changed by later calendar edits.
- [ ] Event titles count as personal content: never logged (ADR 0049).

### 6.8 Rules
- [ ] A rule is: title contains a phrase (case-insensitive) → one goal or one subject. Rules are ordered; first match wins.
- [ ] Rules can be added, edited, reordered and deleted. Changing rules reapplies them to drafts not assigned by hand.
- [ ] "Make a rule" on a draft pre-fills a rule from its title.

### 6.9 Calendar time in Themis
- [ ] Calendar time is a third time source alongside measured and logged, and counts in goal, area and subject totals the same way.
- [ ] Charts and totals that split by source show calendar separately.
- [ ] **No double counting with Melete:** at approval, the part of the event already covered by measured review time (in the assigned subject, or in any subject linked to the assigned goal) is subtracted, and the draft shows the split before approval.

### 6.10 Home
- [ ] Home is a new screen at `/`, first in the drawer, and where users with Themis land. Themis moves to second. Users without Themis see no change. The transcriber (Mnemosyne) moves to `/transcriber`; old job links redirect. The phone app opens Home.
- [ ] **Where the time went:** time per area for this week, month or quarter, split by source, with the top goals by time.
- [ ] **Drafts waiting:** how many calendar drafts await review, linking to the review page.
- [ ] **Connect Google Calendar:** a prompt that can be dismissed, when not connected.
- [ ] Opening Home syncs the calendar (§6.7).
- [ ] Home owns no data: each card reads from its module. Adding a card later (e.g. due today, to-dos) doesn't change the others.
- [ ] Works well on a phone.

### 6.11 Restore drill
- [ ] The Litestream restore drill to a throwaway VM, skipped at 0.11, is done once by Naresh following `docs/deploy.md`, and the runbook is corrected where it was wrong. No code.

## 7. Constraints
- **Data first (ADRs 0084, 0085):** every schema change is a new locked migration with a seed fixture and an upgrade test. Nothing resets the VM's database. Adding a time source changes the `time_entries` source check, so it needs a migration.
- **Vault:** the syllabus agent reads the subject folder through the agent's read-only mount; nothing writes to the vault.
- **Agent isolation:** the agent service keeps no database access, no host port and the shared secret.
- **Dependencies:** only those named in the TRD (the Zod generator and the Calendar client among them).
- **Tests:** no test touches the network, Claude, Gemini, Google Calendar or a real vault. The e2e smoke test gains a Home path and a calendar import against a fake.
- **Logs:** paths and IDs only, never note text, goal names, check-in notes or event titles (ADR 0049).
- **Release branch:** work happens on `release/1.2.0`; Naresh merges and tags.

## 8. Out of scope (KIV)
- To-dos and a "due today" list of his own (next release).
- Other "due today" items on Home (Melete reviews due, check-ins due, Mnemosyne items to review): when Home grows cards.
- Claude suggesting a goal for unmatched drafts.
- Time targets per goal or area, and "intended vs actual" on Home.
- More than one calendar per user; writing to the calendar.
- Other time sources (fitness trackers, screen time).
- The business-idea validator and the Metis advisor as agent endpoints; any other Melete call moving to the agent service.
- Metis, the freelance-jobs product, Workload Identity Federation.

## 9. Open questions
None. Settled in the TRD (ADRs 0103–0109), 2026-11-10:
1. ~~ADR wording~~: ADR 0103.
2. ~~Zod generation~~: an in-repo generator, committed output, drift check in the gate; cross-field rules as Pydantic discriminated unions (ADR 0104).
3. ~~Shared runner~~: `run_agent` plus a rooted vault toolset; syllabus runs stay in `melete_runs` with turns and tool calls (migration 18); `link_runs` unchanged (ADR 0105).
4. ~~Syllabus agent~~: tools scoped to the subject folder, 16 turns, 40 tool calls, 8192 output tokens, 180 s, Sonnet; locked text moves to the agent; moving cache breakpoint; no fallback (ADR 0105).
5. ~~Test gate~~: `scripts/gate.mjs` (ADR 0106).
6. ~~Dependency bump~~: `@anthropic-ai/sdk` 1.x (ADR 0107).
7. ~~Calendar OAuth~~: separate read-only grant, same OAuth client as Gmail, shared token encryption (ADR 0108).
8. ~~Sync mechanics~~: manual sync into reviewed drafts; 14-day re-read window; recurring events expanded; counts on the start day (ADR 0108).
9. ~~Storage~~: migration 19: `time_entries` gains `calendar`; `calendar_account`, `calendar_rules`, `calendar_events` with draft, approved and dismissed (ADR 0108).
10. ~~Double counting~~: measured overlap subtracted at approval (ADR 0108).
11. ~~Home~~: `/`, the transcriber at `/transcriber`, Home only for users with Themis, cards from modules with no `/api/home`, PWA opens `/` (ADR 0109).
