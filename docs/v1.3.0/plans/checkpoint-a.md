# Checkpoint A: Kick-off and hygiene (v1.3.0, tasks 1.1–1.6)

Branch `release/1.3.0`. One commit per task, pushed after each. `pnpm gate --only <folders>` per task; `pnpm gate` + `pnpm e2e` at the end. On approval this is saved to `docs/v1.3.0/plans/checkpoint-a.md`, the Plan cell ticked, committed and pushed (stage by name).

## 1.1 Version 1.3.0 and docs (ADR 0110)
Test first: `scripts/nameGuard.test.mjs` is the red/green check — run it after adding docs; it fails if `docs/v1.3.0/` or ADR 0110 name Mnemosyne as a module and aren't in `HISTORY`.
- `version` 1.2.0 → 1.3.0 in root, `apps/{server,web,agent}`, `packages/shared`, `e2e` `package.json`; `apps/agent/pyproject.toml`; `atlas-agent` entry in `apps/agent/uv.lock` (edit by hand, then `uv lock --check`).
- Root `CLAUDE.md`: version 1.3.0, `docs/v1.3.0/` (two lines: current-version and plan path).
- `docs/README.md`: current version 1.3.0, v1.3.0 line (PRD · TRD · Tasks · plans), v1.2.0 stays "done", ADR 0110 in the index.
- `nameGuard.test.mjs` `HISTORY`: add `docs/v1.3.0/` and ADR 0110 only if the test flags them.
- Commit untracked `docs/v1.3.0/` and `docs/decisions/0110-…md` with the task. Gate: `--only` scripts/docs/deploy as applicable; check `release.sh`/version tests that read versions.

## 1.2 SDK bump
- `apps/server/package.json` `@anthropic-ai/sdk` ^1.6.0 → 1.7 or newest 1.x allowed by `minimumReleaseAge` (check `pnpm-workspace.yaml`); never a `minimumReleaseAgeExclude` waiver. If 1.7 is too new, take the newest eligible and log it.
- `pnpm install`, lockfile committed. Test: existing `claude.client` and `anthropicModels.client` unit tests are the regression check (no network). Gate `--only server`.
- **Naresh** then runs `pnpm --filter @atlas/server test:integration`; I log his result (I don't run it).

## 1.3 `test:integration` config and `.env` docs
- Red: with no `GEMINI_*`/`YOUTUBE_API_KEY`/`ADMIN_EMAIL`/`APP_ORIGINS` in the environment and no `.env`, the integration config's setup fails config parsing. Add a small pure helper/test (e.g. `applyPlaceholders(env)` in the config file or a sibling) that sets placeholders only when the variable is unset, after `.env` is loaded — test that a real value wins.
- `apps/server/vitest.integration.config.ts`: placeholders for `GEMINI_MODEL`, `GEMINI_API_KEY`, `YOUTUBE_API_KEY`, `ADMIN_EMAIL`, `APP_ORIGINS` mirroring `vitest.config.ts`. Tests still skip without `ANTHROPIC_API_KEY`.
- `docs/configuration.md`: new section "A local `.env` for development" (variables a current file needs; `WHISPER_URL`, `VAULT_PATH` ignored). If `scripts/hostingDocs.test.mjs` pins doc sections, extend it.

## 1.4 `study_today` on `Me`
Tests first (red):
1. `packages/shared`: `Me` schema accepts/requires `study_today` (ISO date).
2. Server `me` route/service test: `GET /api/me` returns `studyDay(now, config)`, across the day-start boundary (fake clock before/after `MELETE_DAY_START_HOUR` in `Asia/Singapore`).
3. Web `LogTimeDialog.test.tsx`: device clock a day ahead of `study_today` → date field default and `max` equal `study_today`; never the device date.
4. Update every `Me` fixture/mock in web, server, e2e fakes.
Code: `packages/shared/src/auth.ts` (`study_today: z.iso.date()`); `apps/server/src/routes/me.routes.ts` (`readMe`) + its service using `studyDay` from `themis/periods.ts` and existing config (`APP_TIME_ZONE`, day-start hour); `LogTimeDialog.tsx` reads `study_today` from `useMe` for `useState` default and `max` (keep `min` derived from it, replacing `daysBefore( now … )`/`localDate( now )`). `time.service.ts` unchanged. `themis.spec.ts` green with local time +08 (run with `TZ=Asia/Singapore`); drop any `TZ=UTC` reliance in e2e docs/scripts. Update `architecture.md`/web `CLAUDE.md` if they describe `Me`. Gate `--only shared,server,web`.
Ops (Naresh): confirm `APP_TIME_ZONE=Asia/Singapore` in `/etc/atlas/atlas.env` — noted in the report, not run.

## 1.5 Flaky tests
Run `pnpm gate` three times; record results. If `linkJob.test.ts` or `promptProfiles.routes.test.ts` fails, find the cause (shared state, slow `beforeEach` — look at the latter's setup first, ~7 s alone in 1.2) and fix with a regression test; never raise `testTimeout`. Otherwise log "not reproduced in 3 runs". Commit is `tasks.md` log (plus fix if any).

## 1.6 `jsdom` 31 — conditional
Only if PRD §9.7 confirms it (I'll read it when reaching the task; if not confirmed → ⏸️ and move to Deferred). Then `apps/web` `jsdom` ^30.1.3 → ^31 after reading the changelog; fix test-environment breaks only, no component changes. Gate `--only web`.

## End of checkpoint
`pnpm gate` and `pnpm e2e` (Docker), in local time +08. Report: tasks with hashes, gate table, e2e result, ADRs (none new expected), deferred items, and Naresh's two actions (integration run, `APP_TIME_ZONE` check). Done when gate/e2e are green in +08, `test:integration` runs with only the key, SDK on 1.7.

## Verification
`pnpm gate --only …` per task; final `pnpm gate`, `pnpm e2e`; `TZ=Asia/Singapore` run of the Themis spec; `node --test scripts/nameGuard.test.mjs`.
