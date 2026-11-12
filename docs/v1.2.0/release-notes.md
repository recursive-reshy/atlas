# Atlas v1.2.0 — Release notes

v1.2.0 gives Atlas a home and a second source of time. Syllabus drafts now read the notes of a subject, Google Calendar becomes a reviewed time source for Themis, and a new Home page lands you on where your time went. Underneath, the agent service shares one runner and one generated contract, the Anthropic SDK moves to 1.x, and a test gate replaces running each app's checks by hand.

## Melete
- **Syllabus drafts read your notes** (ADR 0105). Drafting a syllabus is now done by the agent service: it lists the subject's folder, searches it and reads the notes it needs, then submits the draft. A subject with any number of notes can be drafted, where the old call had to fit every note in one prompt. A syllabus draft that can't reach the agent fails with "Agent service unavailable"; there is no fallback to the old call. Settings shows the syllabus's locked instructions, as it does the linker's. Each attempt records its turns and tool calls.

## Themis
- **Google Calendar is a time source** (ADR 0108). Connect one calendar read-only in Settings › Sources, choose the calendar and the day to import from, and Atlas reads your finished timed events into **drafts**. Rules (a phrase in the title, first match wins) pre-assign a draft to a subject or a goal; you approve one, approve all rule-matched ones, or dismiss. Time you already measured in Melete during an event is subtracted, so nothing counts twice.
- **Calendar time is in every total.** Time by area, goal pages, weekly history and Melete's "this week" count `calendar` entries, shown as a third shade beside measured and logged.
- Only the event's title and times are stored; all-day and cancelled events are skipped. Atlas never writes to your calendar.

## Home
- **A new landing page at `/`** for users with Themis (ADR 0109): time by area for the week, month or quarter, the top five goals, and the calendar cards (drafts waiting, or an invitation to connect). It reads the calendar when it opens.
- **Mnemosyne is at `/transcriber`** (and `/transcriber/jobs/:id`). `/jobs/:id` redirects there, so old links work. The phone app opens Home.
- `/themis/calendar` has the Drafts and Rules tabs.

## Under the hood
- **A placement rule for Claude calls** (ADR 0103): one structured reply from input Express can assemble stays in Express; a call that must decide what to read goes to the agent service.
- **One agent runner and a generated contract** (ADRs 0104, 0105). `atlas_agent/runner.py` owns the loop, limits, retries and a moving prompt-cache breakpoint; the agent's Pydantic models are the source and `packages/shared/src/agent.generated.ts` is generated from them, so the two can't drift.
- **`pnpm gate`** (ADR 0106) runs tests, lint and typecheck per folder, plus the contract check, and prints one table; `--only` limits it to folders you touched.
- **`@anthropic-ai/sdk` 1.x** (ADR 0107, API version 2026-10-21).
- The e2e stack gains a Calendar fake and a scripted tool-use syllabus run.

## Configuration
- New in `.env`: `CALENDAR_REDIRECT_URI` (empty keeps Calendar off), `CALENDAR_LOOKBACK_DAYS` (1–90, default 14), `AGENT_SYLLABUS_TIMEOUT_MS`. The agent service reads `SYLLABUS_MAX_TURNS`, `SYLLABUS_MAX_TOOL_CALLS`, `SYLLABUS_MAX_OUTPUT_TOKENS` and `SYLLABUS_TIMEOUT_SECONDS`. `CALENDAR_API_BASE_URL` exists for the e2e stack only and the server refuses it outside `NODE_ENV=test`.
- **Google Cloud:** enable the Calendar API, add the two read-only Calendar scopes to the consent screen and the Calendar redirect URI to the client ([google-cloud-setup.md](../google-cloud-setup.md)). While the app is in *Testing*, Google expires the Calendar token after 7 days and Settings asks you to reconnect; publish the app to stop that.

## Migrations
- **Migration 18** (schema 17 → 18): `melete_runs` gains nullable `turns` and `tool_calls`. Existing rows read back `NULL`.
- **Migration 19** (schema 18 → 19), ADR 0085: adds `calendar_account`, `calendar_rules` and `calendar_events`, and rebuilds `time_entries` so `source` accepts `calendar` and a calendar entry can belong to a subject or a goal. Every existing row is copied unchanged.
- Both are locked with invented-data seeds and upgrade tests from 17 and 18. `deploy.sh` takes a pre-migration copy as before; `--restore-pre-migration` rolls back.

## Known issue
- **Log time near midnight outside UTC.** The Log time dialog defaults to the device's date and the server refuses a day after its own today, so shortly after midnight in a time zone ahead of `APP_TIME_ZONE` the dialog answers "The day can't be in the future". Pick yesterday's date until it is decided (see the Deferred list in `tasks.md`).
