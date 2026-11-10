# Plan — Checkpoint F: Release (v1.2.0)

## Context
Next is **6.1** (checkpoint F, Plan cell ⬜). A–E are done. F is the last stretch before Naresh's release: the Calendar end-to-end spec, the docs pass, and locking migrations 18 and 19. 6.4 (`release.sh`, `deploy.sh`, merge, tag, restore drill) is Naresh's and is not touched. Branch `release/1.2.0`, tree clean. Read: TRD §8, §10, §11, ADRs 0085, 0108, 0109, `e2e/` (fakes, `run.sh`, compose, `signedIn.ts`, `themis.spec.ts`), `calendar/auth.ts`, `google/tokenCipher.ts`, `sql/19-calendar-and-time.sql`.

**Before 6.1:** save this plan to `docs/v1.2.0/plans/checkpoint-f.md`, tick the Plan cell, commit `docs: plan checkpoint F`, push.

## Findings that shape the plan
- Gmail's consent flow is **not** in e2e (no Gmail in `e2e/`), so TRD §8's fallback applies: **seed a connected `calendar_account`** with a token encrypted by the e2e key. Log which.
- The seed goes in the way `themis.spec.ts` already back-dates goals: `docker exec` into the throwaway `atlas-e2e` app container and write `/data/atlas.db` with `node:sqlite`. The container has `TOKEN_ENCRYPTION_KEY`, so the script encrypts with the same `aes-256-gcm` / `v1:iv:tag:ct` format as `google/tokenCipher.ts` (or imports the built module). No new endpoint.
- **The token refresh is the catch.** `getCalendarClient` sets only a refresh token, so the first `events.list` makes google-auth-library call `oauth2.googleapis.com`, which is unreachable (and forbidden) in e2e. `CALENDAR_API_BASE_URL` only moves `rootUrl`. google-auth-library 11.3.1 supports `endpoints: { oauth2TokenUrl }`, so in `buildOAuthClient` the same test-only setting also sets `oauth2TokenUrl` to `${apiBaseUrl}/token`. No new variable, no new dependency; still refused outside `NODE_ENV=test`. **This is a small production-code change in `calendar/auth.ts`, test-first** (a unit test that, with `apiBaseUrl` set, the built client's `endpoints.oauth2TokenUrl` points at it, and unchanged when null). If you would rather not touch `auth.ts`, the alternative is seeding an unexpired `access_token`, which needs a larger change to the client cache; I recommend the endpoint change.

## 6.1 E2E: Calendar fake and `home-calendar.spec.ts` — `test:` (e2e, server)
- **Tests first:**
  - `e2e/fakes/server.test.mjs`: `POST /token` returns an access token; `GET /calendar/v3/users/me/calendarList` returns the list; `GET /calendar/v3/calendars/:id/events` returns the scripted events, honours `timeMin`/`timeMax`, and pages with `pageToken` (two pages, so pagination is exercised). Red first: the routes don't exist.
  - `calendar/auth` test for the token endpoint (above).
  - `e2e/tests/home-calendar.spec.ts` (red until the fake and compose env exist), user `calendar@e2e.test`, modules `melete`, `themis`, own vault `calendar` (add to `run.sh` with `seedVault.mjs`, like `learner`/`planner`):
    1. Seed (docker exec): `calendar_account` connected, calendar `e2e-cal`, `import_from` a week back; one rule (phrase "Standup" → a goal made through the API); a subject with a **measured** Melete entry (inserted through the DB with fixed `started_at`/`ended_at`, since a measured session can't be faked in minutes through the UI).
    2. Fake events (times relative to "now", computed in the spec and passed to the fake through a `PUT /__calendar/events` test hook on the fakes server, so no clock assumptions): "Standup" (matches the rule), "Dentist" (unmatched), "Study block" (overlaps the measured entry by a known amount).
    3. Open Home → sync runs on open → "3 calendar drafts to review".
    4. `/themis/calendar` → **Approve all matched** → one approved; 2 drafts left.
    5. Assign "Dentist" to a goal → Approve.
    6. Approve "Study block" → shows the reduced minutes (counts = length − overlap).
    7. Home: area bar shows "Calendar" time; caption has calendar minutes.
    8. `/jobs/<id>` redirects to `/transcriber/jobs/<id>`.
- **Code:** `e2e/fakes/server.mjs` Calendar routes + token route + events hook; `e2e/docker-compose.e2e.yml` sets `CALENDAR_API_BASE_URL: http://fakes:4000`, `CALENDAR_REDIRECT_URI: http://localhost:3101/api/calendar/oauth/callback`; `run.sh` vault dir; `calendar/auth.ts` `oauth2TokenUrl`. Fakes keep the `server.mjs` style (scripted by request, not by counter).
- Gate: `pnpm gate --only server` for the `auth.ts` change; the spec itself runs in the end-of-checkpoint `pnpm e2e` and once by hand now (`TZ=UTC pnpm e2e` while the Deferred time-zone item is open; note it in the log).

## 6.2 Docs — `docs:`
No tests (the repo has none for prose); verify by grep that every new env var and route named in TRD §5 and §10 appears.
- `docs/architecture.md` final pass: placement rule (ADR 0103), runner, generated contract, syllabus agent, calendar (sync, rules, drafts, overlap), Home, `/transcriber`, the e2e calendar seeding note.
- `docs/google-cloud-setup.md`: enable the Calendar API, the two read-only scopes, the redirect URI, Testing-mode refresh-token expiry (7 days) and the Reconnect path.
- `docs/configuration.md`: `CALENDAR_REDIRECT_URI`, `CALENDAR_LOOKBACK_DAYS` (default 14, 1–90), test-only `CALENDAR_API_BASE_URL`, `AGENT_SYLLABUS_TIMEOUT_MS`, `SYLLABUS_*`. Cross-check against `config.ts` and `docker-compose.yml`.
- `.env.example` (root, `apps/server`, `apps/agent` where they exist): variable names only.
- `docs/v1.2.0/release-notes.md` from TRD §11. I never edit the PRD or TRD.
- Any `CLAUDE.md` that describes a changed thing is updated in the same commit.

## 6.3 `schema-19.sql`, lock 18 and 19 — `chore:` (server)
- **Tests first** (`database.upgrade.test.ts` already requires a seed per locked version and no empty table): add `schema-19` to the locked-version list so the suite goes red for the missing seed and for 18/19 being unlocked.
- Write `apps/server/src/repositories/fixtures/schema-19.sql` (TRD §10): an account, two rules, drafts, an approved and a dismissed event, a `calendar` time entry, every other table filled, `foreign_key_check` clean. `schema-18.sql` already exists.
- Run `pnpm --filter @atlas/server migrations:lock` (adds hashes for 18 and 19 to `migrations.lock.json`; never edits SQL).
- Upgrade tests from 17 and 18 green; `ALLOWED_COUNT_CHANGES` already covers 19's inserts (confirm; add an entry if the seed's counts need one).
- Gate: `pnpm gate --only server`. `release.sh`'s unlocked-migration check then passes (`pnpm --filter ... node --test deploy/release.test.mjs` unchanged).

## End of checkpoint
`pnpm gate` (all steps) and `pnpm e2e` (Docker). Report per CLAUDE.md: what was built with hashes, gate table, e2e result, ADRs written (none expected; the `oauth2TokenUrl` line is covered by ADR 0108's test-only base URL, I'll say so), deferred items (the Log-time near-midnight issue stays open unless you decide it). Then stop; 6.4 is yours.

## Verification
- `pnpm gate --only server` after 6.1's `auth.ts` change and after 6.3.
- `TZ=UTC pnpm e2e`: 10 of 10 specs including `home-calendar`.
- `pnpm gate`: all steps pass; `migrations.lock.json` has entries 18 and 19.

## Open point for you
Is the one-line change in `calendar/auth.ts` (test-only token endpoint from `CALENDAR_API_BASE_URL`) acceptable? Everything else is inside the TRD.
