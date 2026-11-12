# Plan — Checkpoint A: Kick-off (v1.2.0)

## Context
Next task is **1.1** (checkpoint A, Plan cell ⬜). Checkpoint A: version 1.2.0 and docs housekeeping (1.1), the test gate (1.2, ADR 0106), `@anthropic-ai/sdk` 1.x (1.3, ADR 0107). Branch `release/1.2.0`, tree clean. TRD §3 read; ADRs 0106 and 0107 read. No TRD gaps found. One commit per task, files staged by name, pushed after each.

## Before 1.1: plan commit
Save this plan to `docs/v1.2.0/plans/checkpoint-a.md`, tick the Plan cell, commit `docs: plan checkpoint A`, push.

## 1.1 Version and docs housekeeping (`chore:`)
Test first (red): extend `scripts/nameGuard.test.mjs` `HISTORY` is the *fix*, not the test. Red comes from the existing guards once the version moves:
1. Bump `1.1.1 → 1.2.0` in root, `apps/{server,web,agent}/package.json`, `packages/shared/package.json`, `e2e/package.json`, `apps/agent/pyproject.toml`, and the `atlas-agent` entry in `apps/agent/uv.lock` (one-line hand edit, no `uv lock`). `scripts/version.test.mjs` goes red until `docs/README.md` has a `- **v1.2.0` line, then green.
2. `docs/README.md`: current version 1.2.0; v1.2.0 line (PRD, TRD, Tasks, plans); mark v1.1.1 done; add ADR rows 0103–0109 (titles from each file's H1, status Accepted).
3. ADR 0043 status → "Accepted; hand-mirror clause superseded by 0104"; ADR 0055 → "Accepted; narrowed by 0103". Update the matching rows in the README table.
4. `nameGuard.test.mjs` `HISTORY` gains `/^docs\/v1\.2\.0\//` and ADRs 0103–0109 (run it first, expect red on those docs, then add). Check whether 0103–0109 actually name Mnemosyne; add only what the guard needs.
5. Commit by name: the version files, `docs/README.md`, ADRs 0043 and 0055, `nameGuard.test.mjs`, `docs/v1.2.0/` docs and ADRs 0103–0109 (already committed in eec94c2; verify, and stage only what is changed).
Verify per CLAUDE.md for touched folders: root `node --test scripts/*.test.mjs deploy/**/*.test.mjs`; agent test/lint/typecheck for the pyproject/lock change; server/web/shared/e2e untouched except version fields, so run typecheck there once. Report per folder (the gate does not exist yet). Tick 1.1 and log it.

## 1.2 Gate (`feat:`, ADR 0106)
Tests first: `scripts/gate.test.mjs`
- runner with fake steps pass/fail/pass: all three run, table lists them, exit status 1 (red: `gate.mjs` missing);
- `--only` selection by folder name (`shared`, `server`, `web`, `agent`, `e2e`, `root`) and `--tests` (kind `test` only);
- exported step list covers every package's `test`, `lint`, `typecheck` script (read from each `package.json`; web's `test:browser`, e2e's `test:fakes`, per ADR table). Note: the e2e package's `test` is a no-op, so the e2e entry is `test:fakes`.
Then `scripts/gate.mjs`: Node built-ins only, `spawn` per step, entries `{ folder, name, command, args, kind }`, outputs captured, summary table (step, result, time), failed output after it, exit 1 on any fail. No `contract` step yet (TRD §3.1: added in 2.2). Root steps: `scripts/*.test.mjs` and `deploy/**/*.test.mjs` via `node --test`.
Root `package.json`: `"gate": "node scripts/gate.mjs"`, `"test": "node scripts/gate.mjs --tests"`; `lint`/`typecheck` unchanged. Root `CLAUDE.md` "Before you stop" names `pnpm gate --only <folders>` per task, and `pnpm gate` plus `pnpm e2e` at checkpoint end, report pastes the table. Check no other test or doc locks the old `pnpm test` string (grep `pnpm -r test`).
Verify: `pnpm gate --only root`, then a full `pnpm gate` once (all steps run).

## 1.3 `@anthropic-ai/sdk` 1.x (`chore:`, ADR 0107)
- Read the official migration guide for API version 2026-10-21 first (WebFetch/context7; web access is needed here). **Stop and ask** if it lists a break beyond sampling parameters, bearer auth and the `MessageParam` union.
- Bump `apps/server/package.json` `^0.137.0` → latest 1.x, `pnpm install` (lockfile changes only for this dep and its transitive deps).
- Red: `pnpm --filter @atlas/server typecheck` after the bump shows the type errors; fix in `clients/claude.client.ts` (350 lines) and `clients/anthropicModels.client.ts` (33). No Claude call sets sampling parameters (only the Gemini client has `temperature`), so expected work is types only. Unit tests keep the existing fake client, unchanged.
- `pnpm gate --only server,shared` green.
- `test:integration` run **once by hand** (calls the real Claude API; needs `ANTHROPIC_API_KEY` in Naresh's env). If the key is not available I stop and ask rather than skip silently; result goes in the log line.
- Update `apps/server/CLAUDE.md` / `docs/architecture.md` only if they name the SDK version.

## End of checkpoint
Run `pnpm gate` (and `pnpm e2e` if Docker is up; tasks.md requires it at the end of a checkpoint). Report: what was built per task with hashes; the gate table; e2e result; deferred items; ADRs written (none planned) and whether any changes the TRD.
Done when: `pnpm gate` runs every step and prints its table, and the server runs on SDK 1.x.

## Risks / open points
- `uv.lock` entry is hand-edited; `version.test.mjs` already asserts it matches.
- 1.3 needs network (migration guide, npm) and a real API key for the integration run; both are on Naresh.
