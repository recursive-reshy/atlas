# Plan — Checkpoint D: Calendar backend (v1.2.0)

## Context
Next is **4.1** (checkpoint D, Plan cell ⬜); A–C are done. D builds the server side of ADR 0108: Google Calendar as a reviewed time source for Themis (TRD §2.2, §5.1–5.7). Branch `release/1.2.0`, tree clean. TRD §2.2, §5, §7, §8, ADRs 0108 and 0085 read, plus the current `gmail/` folder, `database.ts` migration list, `database.upgrade.test.ts` and the repository layout. One commit per task, files staged by name, pushed after each. No test touches Google; Calendar is faked.

**Before 4.1:** save this plan to `docs/v1.2.0/plans/checkpoint-d.md`, tick the Plan cell, commit `docs: plan checkpoint D`, push.

## 4.1 Shared Google plumbing — `refactor:` (server, neutral)
- **Finding:** there is no separate OAuth state store file today; the state map (`states`, `STATE_TTL_MS`, `MAX_STATES`, `consumeState`, consent creation) lives inside `gmail/auth.ts` (lines ~84–140). So 4.1 extracts it.
- **Tests first:** `google/tokenCipher.test.ts` (moved from `gmail/`, imports only) and a new `google/oauthState.test.ts`: state is unique, bound to its user and origin, single use, expires after the TTL, cap evicts the oldest. Red: module missing.
- **Code:** `git mv gmail/tokenCipher.ts(+test)` → `google/`; new `google/oauthState.ts` exporting `createState( userId, origin )` and `consumeState( userId, state )` (same behaviour, state maps per feature so Gmail and Calendar don't share one pool: the store is a factory `createOAuthStateStore()` and Gmail makes its own). `gmail/auth.ts` imports both. `gmail/auth.test.ts` unchanged apart from the import path.
- Gate: `pnpm gate --only server`.

## 4.2 Migration 19 — `feat:` (server, shared)
- **Tests first:** write `fixtures/schema-18.sql` first (the 18 schema plus rows in `time_entries` of `measured` and `logged`, goal- and subject-based, so the rebuild is exercised; produced by applying 1–18 and seeding as the schema-17 seed was). In `database.upgrade.test.ts`: 18 → 19 keeps every `time_entries` row identical, indexes `time_entries_day` and `time_entries_open` exist, the three new tables exist and are empty, `calendar` source inserts (subject or goal, and neither), `measured` without a subject still refused, constraints on `calendar_rules` (exactly one target) and `calendar_events` (status, `seconds > 0`, unique triple). No `ALLOWED_COUNT_CHANGES` entry. Add readers for the new tables in `READERS` if the harness requires every table to have one.
- **Code:** `sql/19-calendar-and-time.sql` exactly as TRD §2.2 (rebuild via `time_entries_new`, drop/rename, recreate indexes; drop and recreate any view naming `time_entries` as migration 16 did, to be checked in `16-themis-and-time.sql` first); appended to `migrationFiles` with a comment. **Not locked** (6.3).
- `packages/shared/src/time.ts`: `TimeSource` gains `'calendar'`; `time.test.ts` updated. `timeEntries.repository.ts` row parsing accepts it.
- Gate: `pnpm gate --only server,shared`.

## 4.3 Calendar connection — `feat:` (server)
- **Ask before starting (CLAUDE.md "new dependency"):** `@googleapis/calendar` is named by TRD §5.2 and ADR 0108, so it is covered; pin the exact version like `@googleapis/gmail`, and if pnpm's `minimumReleaseAge` refuses the latest, take the newest older one (as in 1.3), no waiver.
- **Tests first:** `calendar/auth.test.ts` (consent URL scopes, code exchange stores the encrypted token, revoked or Testing-mode expiry → broken with the Calendar messages, not configured without `CALENDAR_REDIRECT_URI`); `calendarAccount.repository.test.ts`; `config.test.ts` (`CALENDAR_REDIRECT_URI` optional, `CALENDAR_LOOKBACK_DAYS` default 14 range 1–90, `CALENDAR_API_BASE_URL` refused outside `NODE_ENV=test`); `routes/calendar.routes.test.ts` with Supertest: status for each of the four states, connect returns `{ url }`, callback redirects to `/settings/sources?calendar=choose`, calendars list, selection validation (`import_from` a day, not future, ≤ 365 days back), changing calendar deletes old drafts and keeps approved entries and markers, disconnect with and without `remove_time`, 404 without Themis (`requireModule( 'themis' )`), isolation between two users; health `calendar_connection` recorded on connect and failures.
- **Code:** `calendar/auth.ts` (shape of `gmail/auth.ts`, uses `google/`), `repositories/calendarAccount.repository.ts`, `routes/calendar.routes.ts`, `services/calendar.service.ts`, config keys and `.env.example` entries (`envExample.test.ts` checks them), shared contracts in `packages/shared/src/calendar.ts`, health kind `calendar_connection` (check whether `health` accepts new kinds without a migration: it accepts per-user app kinds via `recordCheck`; if a CHECK blocks it, **stop and ask** rather than add a migration beyond 19).
- Gate: `pnpm gate --only server,shared,root`.

## 4.4 Rules — `feat:` (server, shared)
- **Tests first:** `calendar/rules.test.ts` table (case-insensitive contains, first by `position`, empty rules, no match, overlapping phrases); `calendarRules.repository.test.ts`; routes: list, create (phrase 1–100, exactly one target), patch with `position` renumbering as Themis areas do, delete, own targets only, subject needs Melete, goal needs Themis (404); a rule change reapplies to drafts with `assigned_by` null or `rule` and leaves `hand` alone, in one transaction.
- **Code:** pure `calendar/rules.ts` (`matchRule( title, rules )`), repository, service `applyRules( userId )`, routes under `/api/calendar/rules`. Reuse the areas reorder helper from `themisAreas.repository.ts`.
- Gate: `pnpm gate --only server,shared`.

## 4.5 Sync — `feat:` (server)
- **Tests first:** `services/calendarSync.service.test.ts` with a fake Calendar client (injected, as the Gmail client is): window `max( import_from, now − lookback )`; all pages read; filters (all-day, not ended, zero seconds); unknown → draft with rules applied; known draft with changed title or times → updated and rules reapplied unless `hand`; draft no longer returned → deleted; approved and dismissed untouched; a read error mid-pages changes nothing and records a failed health check; no account or no calendar → 409; `day` uses `dayOf` with `APP_TIME_ZONE`; recurring events arrive expanded (`singleEvents`); returns `{ added, updated, removed, drafts }`; sets `last_synced_at`. Route: `POST /api/calendar/sync?if_older_than=300` skips under the age and returns current counts. A log test checks no title reaches the logs (ADR 0049).
- **Code:** `calendar/calendar.client.ts` (wraps `@googleapis/calendar`, honours `CALENDAR_API_BASE_URL`), `repositories/calendarEvents.repository.ts`, `services/calendarSync.service.ts`, route.
- Gate: `pnpm gate --only server,shared`.

## 4.6 Overlap, drafts and approval — `feat:` (server, shared)
- **Tests first:** `calendar/overlap.test.ts` table: none, partial, full, two measured entries overlapping each other (union, not summed), one spanning the event, goal → measured entries of every subject linked to it. Routes: `GET drafts` newest first with `overlap_seconds` and `counts_seconds` and the rule's phrase; `PATCH` (hand assignment sets `assigned_by = 'hand'`, times recompute `seconds` and `day`, end after start, both past, one target only); `approve` (409 without assignment, inserts a `calendar` time entry with `counts_seconds`, `time_entry_id` null when fully covered, atomic); `approve-matched` returns `{ approved }` and only takes `rule`-assigned; `dismiss`; `/api/time-entries` PATCH and DELETE for `calendar` entries (delete leaves the event `approved`, `time_entry_id` null; `measured` stays read-only; a goal-targeted calendar entry accepts `goal_id`).
- **Code:** pure `calendar/overlap.ts` (`measuredOverlap`), drafts service and routes, `timeEntries` service/routes widened to `calendar`.
- Gate: `pnpm gate --only server,shared`.

## 4.7 Themis and Melete numbers — `feat:` (server, shared, web types, docs)
- **Tests first:** `themis` breakdown tests gain a `calendar` field per source in goal, area and `time_by_week` rollups with `seconds` still the sum; `GET /api/themis/overview` returns `calendar_drafts` (0 when not connected) and `calendar_status`; Melete `seconds_this_week` counts calendar entries for the subject (`melete.service.test.ts`). Shared schema tests for the new fields.
- **Code:** `themis.ts` and rollup services, overview route, `packages/shared` themis contract. Web fixtures that parse these shapes gain the fields so web typecheck stays green; no UI (checkpoint E).
- **Docs, same commit:** `docs/architecture.md` (calendar section stub, schema 19), `apps/server/CLAUDE.md` (folders `google/`, `calendar/`). The final pass is 6.2.
- Gate: `pnpm gate --only server,shared,web,root`.

## End of checkpoint
`pnpm gate` and `pnpm e2e` (Docker up). Report per task with hashes, the gate table, the e2e result, tests moved or deleted, ADRs (none planned), anything deferred.
Done when: through the API a fake calendar's events become drafts, rules assign them, approval stores time with overlaps subtracted, and the overview shows calendar time.

## Stop-and-ask points
1. **OAuth state (4.1):** the TRD speaks of moving a state store, but it is inline in `gmail/auth.ts`. I extract it as a store factory so each feature keeps its own pool; Gmail behaviour is unchanged. Say if you want one shared pool.
2. **Health kind (4.3):** if the health tables restrict kinds by CHECK, `calendar_connection` would need another migration than 19's TRD text; I stop and ask then.
3. **Pinning `@googleapis/calendar` (4.3):** newest version past pnpm's age gate.

## Verification
Per task `pnpm gate --only <folders>`. After 4.2, the upgrade test from 17 and from 18 both green. At the end `pnpm gate` and `pnpm e2e`.
