# 0106. The test gate runs every step and reports all failures

- Status: Accepted
- Date: 2026-11-10

## Context
The root `pnpm test` is `pnpm -r test && node --test scripts/… deploy/…`. One red package stops the run, so later packages and the `scripts/` and `deploy/` tests report nothing, and lint and typecheck behave the same. In 1.1 a red `scripts` test went unseen for a whole checkpoint. There is no CI, so the gate is whatever Claude Code runs before it stops.

## Decision
- **`scripts/gate.mjs`**, Node built-ins only, runs a fixed list of steps and never stops early:

  | Folder | Steps |
  | --- | --- |
  | `packages/shared`, `apps/server`, `apps/agent` | test, lint, typecheck |
  | `apps/web` | test, `test:browser`, lint, typecheck |
  | `e2e` | `test:fakes`, lint, typecheck |
  | root | `scripts/*.test.mjs`, `deploy/**/*.test.mjs` |
  | contract | agent JSON Schema export and generated Zod (ADR 0104) regenerate with no diff |

- At the end it prints one table (step, result, time), prints the full output of failed steps only, and exits non-zero if any step failed.
- `--only <folders>` runs the named folders' steps, adding the contract check whenever `agent` or `shared` is named. `--tests` runs test steps only.
- Root scripts: `pnpm gate` runs everything; `pnpm test` runs `gate --tests`. `pnpm lint` and `pnpm typecheck` stay as quick commands.
- **Out of the gate:** `test:integration` (calls the real Claude API) and `pnpm e2e` (needs Docker; once per checkpoint).
- The gate has its own `node:test` test with fake steps.
- The root `CLAUDE.md` "Before you stop" names `pnpm gate --only <folders>` per task, and `pnpm gate` plus `pnpm e2e` at the end of a checkpoint. A checkpoint report pastes the gate's table.

## Consequences
- One failure no longer hides the rest; a report shows every step's result.
- A new package or step is one line in the gate's list.

## Alternatives considered
- **`pnpm -r --no-bail test`:** continues across packages but still exits red, so `&&` skips the root tests; lint and typecheck unchanged.
- **Per-package commands listed in `CLAUDE.md` only:** relies on each one being run by hand.
