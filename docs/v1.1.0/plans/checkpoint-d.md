# Checkpoint D plan: Themis web, e2e, docs, release (tasks 8.1–9.4)

## Context
Checkpoints A–C are done: the server has Melete's concept layer, Themis (`/api/themis/*`) and time (`/api/time-entries`), all with shared contracts in `packages/shared/src/themis.ts` and `time.ts`. Checkpoint D builds the Themis web screens and the Log time dialog, extends the e2e fakes and adds two specs, finishes the docs, locks migrations 15 and 16, and releases with Naresh. Done when Themis is the landing page, both e2e specs pass, migrations are locked, and 1.1.0 runs on the VM at schema 16.
ADRs to read per task: 0092 (8.1–8.3), 0091 (8.4), 0085 (9.3), 0086 (9.4).

Rules for every web task (`apps/web/CLAUDE.md`): files ≤150 lines, one PascalCase folder per component (`Name.tsx`, `Name.test.tsx`, `index.ts`), `#src/*` for imports climbing two levels, MUI props then `sx`, tap targets ≥44 px, no new dependency, no chart library. Gate per task: `pnpm test`, `lint`, `typecheck` for web (plus `test:browser` where named), `apps/web/CLAUDE.md` and README updated in the same commit, tasks.md ticked with a log line.

## Shared patterns to reuse
- API wrappers: `request( path, Schema, init )` in `api/request.ts`, `jsonInit` in `api/melete.api.ts`; model new `api/themis.api.ts`, `api/timeEntries.api.ts` on `api/gaps.api.ts` (test with `vi.stubGlobal( 'fetch' )`).
- Query keys in `hooks/queryKeys.ts` (`meleteKeys` shape): add `themisKeys` and `timeKeys`.
- Hooks: `useMeleteGaps.ts` (query shape), `useMeleteMutations.ts` (typed mutation wrappers, `invalidateQueries`); tests with `renderHookWithClient`.
- Dialogs: `ConfirmDialog`, `AddFeedDialog`, `LearningRootSetup` for the MUI `Dialog` + `useId` pattern.
- `formatStudyTime.ts` for hours and minutes text; `test-support/me.fixture.ts` (override `modules` to include `themis`); `renderWithRouter` for routed tests; `MeleteToday.browser.test.tsx` / `SyllabusEditor.browser.test.tsx` as the browser-test template (phone 390×844 and desktop, light and dark, tap sizes).

## 8.1 Drawer, module home, routes
- Tests first: `NavDrawer.test.tsx` (order Themis, Mnemosyne, Melete; Themis hidden without the module), `moduleHome.test.ts` (user with Themis lands on `/themis`; without it, unchanged), a routed test that `/themis` redirects a member without Themis via `RequireModule`.
- Code: reorder `NAV_ITEMS` in `components/NavDrawer/NavDrawer.tsx` with a Themis item (`/themis`, `isCurrent` for `/themis*`); put `themis` first in `MODULE_HOMES` (`moduleHome.ts`); add a `RequireModule module="themis"` layout in `routes.tsx` with `themis` and `themis/goals/:goalId`, pointing at placeholder pages `ThemisHome` and `ThemisGoal` (replaced in 8.2/8.3).
- Changed existing tests (listed in the log): `NavDrawer.test.tsx`, `moduleHome` tests, any routed test that assumed Mnemosyne is the home for the admin.

## 8.2 Themis home
- Tests first: hook tests for `useThemisOverview( period )` and `useAnswerCheckin`; component tests for `ThemisHome` (empty state with the inline "Add your first area" form; areas with goal cards; check-ins due answered in place via five rating buttons and an optional note), `GoalCard` (the three outcome displays: learning = coverage and mastery bars, metric = latest vs target with the last 8 updates, check-in = last 8 ratings), `TimeByArea` (one bar per area, measured and logged as two shades, hours and minutes as text, week/month/quarter toggle).
- Code: `api/themis.api.ts` (overview, areas, check-in), hooks, `ThemisHome`, `CheckinsDue`, `TimeByArea` (MUI `Box`/`LinearProgress`), `GoalCard`, `OutcomeDisplay`, `AddAreaForm`. The period is held in `?period=`.
- The Log time FAB is added in 8.4 once the dialog exists.

## 8.3 Dialogs, goal detail, All goals
- Tests first: `AreaDialog` (create, rename; delete refused with a message when the area has goals), `GoalDialog` (name, area, outcome type with its fields: metric unit and target, check-in cadence; target date; the outcome type is read-only when editing), `MetricUpdateDialog`, `LinkSubjectsDialog` (lists the user's subjects; a subject already linked elsewhere is shown as moving; hidden or disabled without the Melete module), `ThemisGoal` page (history lists: metric updates, check-ins, per-week time bars from `time_by_week`, linked subjects, status change to achieved or dropped, delete with `ConfirmDialog` stating it removes updates, check-ins and goal-logged time), `AllGoals` list (achieved and dropped goals reachable here).
- Code: area/goal/metric/link mutation hooks (invalidate overview and goal keys); `ThemisGoal` page; `AllGoals` as a section or route reached from the home (`/themis?view=all`, no new route beyond the two the TRD names).
- The server validates everything; the web shows the server's message from the error body.

## 8.4 Log time dialog, goal picker, Melete settings
- Tests first: `LogTimeDialog` component test (target picker grouped Subjects / Goals, only active goals; chips 15/30/45/60/90 fill minutes; minutes 1–1440; day defaults to today and cannot be in the future; note; posts `LogTimeBody` with exactly one of `subject_id` or `goal_id`; invalidates overview, today and subject keys), `SubjectSettings` goal picker test (sends `goal_id`, "None" sends null; only active goals), `SessionSettings` test; `LogTimeDialog.browser.test.tsx` on a phone viewport (390×844) and desktop, light and dark: tap sizes ≥44 px, no horizontal scroll, FAB not covering the dialog actions.
- Code: `api/timeEntries.api.ts`, `useLogTime`, `LogTimeDialog` (shared), the MUI `Fab` on Themis home (new in the codebase; ≥44 px, above the drawer content), a Log time button on `MeleteSubject` that preselects the subject, the goal picker in `SubjectSettings` (reads goals through the Themis overview, shown only when the user has Themis), and a new `SessionSettings` component in Settings → Melete for `melete_session_gap_minutes` (1–30) and `melete_final_card_seconds` (0–120). A new component is used because `MeleteSettings.tsx` is at 115 lines. This is the web work the 7.1 log line asked to fold in here.
- Open point: "not more than 365 days back" and "not in the future" use the study day on the server; the dialog offers a plain date input bounded by today and today − 365 and relies on the server's message at the edges.

## 9.1 Anthropic fake and e2e specs
- Read `LOCKED_INSTRUCTIONS_*` first lines in `apps/server/src/melete/prompts.ts` for the syllabus, map, suggest and approved-questions forms; add each to `SYSTEM_ANSWERS` in `e2e/fakes/server.mjs` with payloads in `fixtures.mjs` (a new fixture module would also need the `Dockerfile` COPY). Tests first in `e2e/fakes/server.test.mjs` (`pnpm test:fakes`), including that the approved-form first line is distinct from the plain one.
- Spec 1 `e2e/tests/melete-syllabus.spec.ts`: set level → Draft syllabus → Approve → the seeded note is mapped → coverage shows on the card → Suggest resources shows items with search links and no URL text → a review adds measured time (time this week > 0).
- Spec 2 `e2e/tests/themis.spec.ts`: add area and goal → link the subject → log time → home shows measured and logged shades → answer a check-in (a check-in goal created with a start date that makes a period due is not possible through the UI, so the spec first creates the goal and uses the fake clock if the stack has one; if it has none, the check-in step is covered by the overview route plus a goal created through the API test route. **To confirm when I open the e2e code in 9.1.**)
- `playwright.config.ts`: new specs run in the `chromium` project except where they need the phone layout (the `melete` project matches only `melete.spec.ts`; spec 1 reuses the vault seed, so it goes with the Pixel 7 project and `testMatch` is widened).
- The existing `melete.spec.ts` flow (unapproved subject) stays unchanged. Per-task gate for this task: `pnpm e2e` (Docker running).

## 9.2 Docs
- `docs/architecture.md` final pass inside the existing `##` sections only (the section list is asserted by `scripts/architectureDocs.test.mjs`); check Melete (concept layer, mapping, mastery, time), Settings, Accounts (module list) and that Themis web routes are described.
- `docs/v1.1.0/release-notes.md` in the shape of `docs/v0.11.0/release-notes.md` (New, Changes, Upgrading from 1.0, Deferred, Known issues) from TRD §10; add `· [Release notes](v1.1.0/release-notes.md)` to the v1.1.0 line in `docs/README.md` (it stays "in progress" until Naresh releases).
- Check `apps/web/CLAUDE.md` and `apps/server/CLAUDE.md` mention Themis and time.
- Tests: `scripts/*.test.mjs` (version, architecture docs) stay green.

## 9.3 Seed for schema 16 and lock
- Tests first: `fixtures.guard.test.ts` fails for 16 once locked, so first write `fixtures/schema-16.sql` (invented data; every table filled including `themis_areas`, `themis_goals` of all three outcomes, `themis_metric_updates`, `themis_checkins`, `time_entries` of both sources, `melete_subjects.goal_id`, a `themis` row in `user_modules`; passes `foreign_key_check`).
- Run `pnpm --filter @atlas/server migrations:lock`, commit `migrations.lock.json`, confirm `migrations:lock --check` passes and the generic `database.upgrade.test.ts` cases for 15 and 16 pass (check `READERS` and `ALLOWED_COUNT_CHANGES` need no change).
- Never edit migration 15 or 16 after locking.

## 9.4 Release with Naresh
- Not run by me: Claude Code runs nothing against the VM, GCP or the bucket. I prepare the checklist (`release.sh 1.1.0`, `deploy.sh 1.1.0` schema 14 → 16, the rollback command `--restore-pre-migration`, and the two manual checks: one subject draft → approve → map, one goal with logged time) and fix findings Naresh reports, one commit each. The task is ticked only after Naresh confirms.

## Verification (end of checkpoint)
- Per folder: tests, lint, typecheck for `apps/web`, `apps/server`, `packages/shared`, `e2e` (plus `test:fakes`); `pnpm --filter @atlas/web test:browser`; agent tests; `deploy/` tests via root `pnpm test`.
- `pnpm e2e` with Docker running.
- Report per CLAUDE.md "Before you stop": tasks with commit hashes, results, ADRs (none planned; the check-in e2e step and the "All goals" placement may need a decision), deferred items.

## Questions that would need an ADR if the answer differs
- None blocking. If the e2e stack has no way to make a check-in due (no clock control), I will stop and ask before adding a test route or a dependency.
