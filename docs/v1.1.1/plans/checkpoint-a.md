# Plan — Checkpoint A: Docs and conventions (v1.1.1)

## Context
Checkpoint A is a docs-only checkpoint: bump to 1.1.1, make each fact live in one place (`architecture.md` for how, ADRs for why, `CLAUDE.md` for rules), trim the README, and make `.env.example` agree with `config.ts`. No application behaviour changes; `pnpm test` stays unchanged.

**Open point to flag:** `docs/v1.1.1/` holds only `tasks.md`. `tasks.md` says it is "built from `trd.md` in this folder" but there is no `trd.md` (or `prd.md`). Checkpoint A needs no TRD section, so I proceed; later checkpoints cite TRD §3 etc. and will need it.

Branch `release/1.1.1` (already checked out). One commit per task, each pushed, files staged by name. Uncommitted today: `CLAUDE.md` (root, modified), `docs/v1.1.1/` (untracked); `apps/*/CLAUDE.md` are already committed (c072ae6).

## 1.1 Kick-off  (`chore:`)
Tests first: none exist for versions; red→green is a check, not a test: `grep -rn '1\.1\.0'` over the files below must be empty afterwards, and `pnpm test` / `pnpm lint` / `pnpm typecheck` unchanged.
- Version `1.1.0 → 1.1.1` in: `package.json`, `apps/{server,web,agent}/package.json`, `packages/shared/package.json`, `e2e/package.json`, `apps/agent/pyproject.toml`, and the `atlas-agent` entry in `apps/agent/uv.lock` (edit that one line by hand; no `uv lock`, no dependency change). Check `pnpm-lock.yaml` has no workspace version to touch.
- `docs/README.md`: "current version is 1.1.1"; add a v1.1.1 line (Tasks, checkpoint plans; link only docs that exist — PRD/TRD links only if Naresh adds them), mark v1.1.0 as done.
- Commit by name: root `CLAUDE.md`, `docs/v1.1.1/tasks.md`, the version files, `docs/README.md`. Check `git diff CLAUDE.md` first so I commit only Naresh's edit as intended.
- Tick 1.1, add log line. (The plan file itself is committed first, with the Plan cell ticked, as the workflow says.)

## 1.2 Orphaned knowledge → `docs/architecture.md`  (`docs:`)
- `git show v1.1.0:apps/server/CLAUDE.md` (222 lines) and `v1.1.0:apps/web/CLAUDE.md` (109 lines) against the current `architecture.md` (61 lines, dense prose per topic) and the new, shorter `CLAUDE.md` files.
- List every *behaviour* statement present only in the old files. Known candidates from `tasks.md`: worker fairness via `eligible_users`, `requestOrigin` trust rules, vault-sync health-file format, the gate's decision order, the Melete generator's order of work. `architecture.md` already mentions `eligible_users` and health status in passing; add only what is missing.
- Add as prose in the matching existing paragraph (Accounts, Status, Melete, web gate), never a file-by-file listing. Rules/style items go to neither. Verify each claim against the code before writing it (read the code, not the old description).
- Show the list "found → where added / dropped as already covered" in the commit body-less report. No code changes.

## 1.3 README trim  (`docs:`)
- Keep: what Atlas is, run locally (Setup, Requirements, Development basics), where the docs are. Current `README.md` is 291 lines (Configuration, Troubleshooting, Status and roadmap, per-feature usage).
- Version history/roadmap → `docs/v*/release-notes.md` where missing (v1.1.0 has one; check 0.2.0, 0.3.1, 0.1.0, which have none, and only create if the README holds history not already there). Configuration → pointer to `.env.example`; Troubleshooting/usage → move to `docs/deploy.md` or keep the one-line pointer if already covered there. Nothing is deleted without a home; git history keeps the rest.
- Check every link and relative path after the trim.

## 1.4 `.env.example` agrees with `config.ts`  (`test:` then `docs:`)
- Finding: `apps/server/.env.example` already comments every variable; root `.env.example` (Compose) carries only the Compose-facing subset; `deploy/vm/atlas.env.example` is a third file. The server `CLAUDE.md` says "`.env.example`" without saying which, so first make it say `apps/server/.env.example` is the full list.
- Test first (red): one `node:test`/vitest in `apps/server` that reads the `EnvSchema` keys from `config.ts` (export the key list if needed — smallest change; if that is judged a new surface, parse the file text instead) and asserts each appears in `apps/server/.env.example` immediately under a `#` comment line. Expected red: `SESSION_DAYS`/`VAULTS_PATH` sit under the "Sign-in" heading but `VAULTS_PATH` is not sign-in; `E2E_TEST_SIGNIN` has no entry (deliberately test-only, so it goes on an explicit allow-list or gets a "tests only, never set" comment); headings and the "empty: default" notes must match `config.ts` defaults (PORT, SUMMARY_TIMEOUT_MS, REVIEW_TTL_HOURS, CLEANUP_INTERVAL_MINUTES checked).
- Then green: fix the file (move `VAULTS_PATH` under its own heading, add `E2E_TEST_SIGNIN`, correct any default that drifted). Also add one-line comments in root `.env.example` and `deploy/vm/atlas.env.example` only where a variable lacks one, and confirm their variables exist in `config.ts` or Compose.
- Ask before adding the test if you consider it beyond "docs only": it is new test code, no new dependency.

## Verification (each task, before ticking)
`pnpm test`, `pnpm lint`, `pnpm typecheck` green (docs-only, so unchanged); agent tests and `deploy/` `node:test` run once at the end for the version bump. No `pnpm e2e` (needed from checkpoint F). End-of-checkpoint report: hashes per task, results per folder, ADRs written (none expected), deferred items.

## After approval
Save this plan to `docs/v1.1.1/plans/checkpoint-a.md`, tick the Plan cell in `tasks.md`, commit (`docs: plan checkpoint A`), push, then start 1.1.
