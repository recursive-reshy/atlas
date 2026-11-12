# Plan — Checkpoint B: Agent contract and runner (v1.2.0)

## Context
Next is **2.1** (checkpoint B, Plan cell ⬜); checkpoint A is done. B: Pydantic-first contract as discriminated unions (2.1), an in-repo Zod generator (2.2, ADR 0104), a shared agent runner and vault toolset (2.3, ADR 0105), a moving cache breakpoint (2.4), architecture docs (2.5, ADR 0103). Branch `release/1.2.0`, tree clean. TRD §4.1–4.3 and ADRs 0103–0105 read, plus the current `contract/link.py`, `contract/export.py`, `linker/loop.py`, `linker/tools.py`, `claude.py`, `packages/shared/src/agent.ts` and `scripts/gate.mjs`. One commit per task, files staged by name, pushed after each.

**Before 2.1:** save this plan to `docs/v1.2.0/plans/checkpoint-b.md`, tick the Plan cell, commit `docs: plan checkpoint B`, push.

## 2.1 Pydantic discriminated union (neutral) — `refactor:`
Touches: `apps/agent` only (plus regenerated `schema/link_contract.json`).
- **Red first**, in `tests/contract/test_link.py` and `test_export.py`: `AgentUsage` exists; `LinkResponse` validates through a `TypeAdapter` as a union on `outcome`; the exported schema has a `oneOf` with a `const` discriminator (`linked` / `failed`); `FailedLinkResponse.suggestions` has `maxItems: 0`; `reason` on `linked` is still serialised as `null`. Existing invalid examples (`linked-with-reason`, `failed-with-suggestions`, `failed-no-reason`) must still fail, valid ones still pass.
- **Code:** `contract/link.py`: `LinkedResponse` (`outcome: Literal[ LinkOutcome.LINKED ]`, `reason: None`), `FailedLinkResponse` (`reason` min 1, `suggestions` max 0), `LinkResponse = Annotated[ LinkedResponse | FailedLinkResponse, Field( discriminator = "outcome" ) ]`; `LinkUsage` → `AgentUsage`; delete `model_validator`. Update `export.py` (the union needs a `TypeAdapter` entry or both members listed), `linker/loop.py`, `main.py` (constructs and reads `LinkResponse`), and tests' imports/constructors.
- **Check (TRD stop point):** the exported schema for `reason: None` must keep the wire identical (`null` present). If it cannot, **stop and ask**. Also note what keyword it emits (`type: "null"` or `const: null`): ADR 0104's list says only "nullable fields", so if it is not `anyOf [ X, null ]` I will ask before extending the generator in 2.2.
- **Neutral proof:** golden examples unchanged and green; JSON of `run_linker` responses byte-identical (assert via `model_dump_json` on the existing loop tests).
- Gate: `pnpm gate --only agent`. (Zod side untouched here; the TS mirror still says `LinkUsage`, which is fine until 2.2.)

## 2.2 Generator and swap — `feat:`
Touches: `packages/shared` (`scripts/`, `src/agent.generated.ts`, `src/agent.ts`, `package.json`), `scripts/gate.mjs` and its test, root and agent `CLAUDE.md`, `apps/agent/schema/`.
- **Tests first** `packages/shared/scripts/generateAgentContract.test.ts` (vitest; table per keyword): object (required keys), string min/max/pattern, integer, array max items, enum, nullable (`anyOf` with null), `$ref` to `$defs`, mapped `$ref` (`VaultDir` → import from `./auth.js`), `oneOf` with `const` discriminator → `z.discriminatedUnion`, dependency ordering, header comment, house style (spaces in brackets, trailing commas), and an unsupported keyword throwing with keyword and JSON path. Red: the script does not exist.
- **Generator:** reads every `apps/agent/schema/*_contract.json`, writes `src/agent.generated.ts`. Pure `generate( schemas ): string` exported for the tests, with a thin CLI main. Script `"generate:agent": "tsx scripts/generateAgentContract.ts"`.
- **Dependency note:** `tsx` is named by the TRD's script line but is only in `apps/server` today. I will add it to `packages/shared` devDependencies at the version the server already uses (no new package in the lockfile). If you would rather not, the fallback is `node scripts/...ts` (Node 24 type stripping). Say if you want that.
- **Tooling:** `scripts/*.ts` is outside `rootDir: ./src`. I will add `scripts` to the ESLint `projectService.allowDefaultProject` globs and a small `tsconfig` include change so `typecheck` and `lint` cover it (TRD §4.2 step 6: linted, not ignored). Verify `tsconfig.build.json` still emits only `src`.
- **Swap:** `agent.ts` becomes `export * from './agent.generated.js'` (+ any alias needed so `LinkUsage` imports in server and web keep compiling, or rename those imports to `AgentUsage` in the same commit; I will pick the alias-free rename if it is under ~10 lines, since the types are identical). Delete the hand schemas and `superRefine`. `agent.test.ts` and `agent.examples.test.ts` pass unchanged apart from the `LinkUsage` name.
- **Gate contract step:** in `scripts/gate.mjs` add `kind: 'contract'` step (folder `agent`/`shared`): `uv run python -m atlas_agent.contract.export`, `pnpm --filter @atlas/shared generate:agent`, then `git diff --exit-code` on `apps/agent/schema/` and `packages/shared/src/agent.generated.ts`. Add to `scripts/gate.test.mjs` first (step list includes it, selected by `--only agent` and `--only shared`, not by `--tests`). Note the diff check needs the generated file committed before the step can pass, so the step is added last in the commit sequence, within the same commit.
- **Docs, same commit:** root `CLAUDE.md` contract exception line; `apps/agent/CLAUDE.md` contract bullet: "generated by `pnpm --filter @atlas/shared generate:agent`; never edit by hand".
- Gate: `pnpm gate --only shared,agent,server,web,root` (the rename touches server and web).

## 2.3 Runner and vault toolset (neutral) — `refactor:`
Touches: `apps/agent` only.
- **Tests first (new files, before any move):**
  - `tests/test_runner.py`: with `ScriptedClaude`, a tiny `AgentSpec` and a throwaway `SubmitModel`: submits → `SUBMITTED` with the validated submission; invalid then valid; invalid twice; nudge then fail on the second reply without tools; turn limit; tool-call limit; timeout; `ClaudeError` with and without status. Assert the exact existing wording of each reason (copied from `loop.py`).
  - `tests/vault/test_toolset.py`: `vault_tools( root, settings, include )` returns only the included tools, each handler runs against `root`, unknown path escapes are refused, missing args give the existing error texts. Port the assertions of `tests/linker/test_tools.py` to the new API; leave the old file until the move, then it is deleted (list it in the log).
- **Code:** `atlas_agent/runner.py` (`Limits`, `AgentTool`, `AgentSpec[ SubmitT ]`, `AgentOutcome`, `AgentRun[ SubmitT ]`, `run_agent`), `atlas_agent/vault/toolset.py` (`vault_tools`, moving `build_tool_definitions` and `run_vault_tool` bodies; `ToolResult` moves with it). The submit tool is built by the runner from `submit_model` (`model_json_schema()`), as `linker/tools.py` does today. `linker/loop.py` shrinks to: build instructions and first message, `run_agent`, `apply_checks` on `SUBMITTED`, build `LinkResponse`; `SubmitSuggestions` stays with the linker.
- **Neutral proof:** `tests/linker/test_loop.py` is **unchanged apart from imports** (366 lines); the request the fake receives is identical (same system block, tools order, `cache_control` on the last tool and the system block, messages).
- Gate: `pnpm gate --only agent`.

## 2.4 Moving cache breakpoint — `feat:`
Touches: `apps/agent/src/atlas_agent/claude.py`, `runner.py`, tests.
- **Test first** in `tests/test_runner.py`: on a scripted 4-turn run, each request the fake received has `cache_control` on the last block of its newest user message, none on earlier messages, and at most 4 breakpoints in total (system + last tool + latest message). `ScriptedClaude` keeps request objects by reference, so the runner must build a **fresh marked copy per request** (mark at request time, leave its own history unmarked); the test would otherwise see later mutation. Also a `test_claude.py` case: `AnthropicClaude` serialises `cache_control` on a text and a tool-result block (payload via `exclude_none`).
- **Code:** add optional `cache_control: CacheControl | None = None` to `TextBlock` and `ToolResultBlock`; runner marks copies of the messages with `model_copy( deep = True )`.
- Known edge: the nudge and correction messages are user messages too and get the breakpoint like any other.
- Existing `test_loop.py` assertions stay green (they check content, not breakpoints).
- Gate: `pnpm gate --only agent`.

## 2.5 Architecture doc — `docs:`
`docs/architecture.md` agent section: ADR 0103's placement rule (one paragraph) and the table, the runner (`AgentSpec`, limits, moving breakpoint, toolset), and the generated contract flow (Pydantic → JSON Schema → Zod, the gate step). Check `apps/agent/CLAUDE.md` mentions (file list, `linker/tools.py` references) are updated. Gate: `pnpm gate --only root`.

## End of checkpoint
`pnpm gate` (all steps, now including contract) and `pnpm e2e` (Docker is up). Report: per task, what was built with hashes; gate table; e2e result; tests moved or deleted (`tests/linker/test_tools.py` expected); ADRs (none planned) and whether any change the TRD; deferred items.
Done when: the linker behaves exactly as before on the runner, and changing a Pydantic contract model regenerates Zod with no hand edits.

## Stop-and-ask points (known)
1. 2.1: schema cannot keep `reason: null` on the wire, or emits a keyword outside ADR 0104's list.
2. 2.2: adding `tsx` to `packages/shared` (see above).

## Verification
Per task `pnpm gate --only <folders>`; contract round trip by hand once in 2.2: edit a Pydantic field, run export and `generate:agent`, see the Zod change and the gate step fail until committed; revert.
