# Tasks — Atlas v1.3.0

Built from `prd.md` and `trd.md` in this folder. Tasks run strictly in order. Each one is test-first (ADR 0007) and ends in its own commit.

**Branch:** `release/1.3.0`. Never commit to `main`, never merge, never tag.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done (tests green, committed, pushed) · ⏸️ Deferred · 🔒 Blocked (waiting on a decision)
**Plan:** ⬜ Not approved · ✅ Approved (the link points to the saved plan)

## How this file works
- **Start of a checkpoint:** in plan mode, write one plan for every task in it (files to touch, tests to write first, expected red → green path), then stop. When Naresh approves it, save the plan to the linked file, tick the Plan cell, commit, push.
- **During a checkpoint:** work through its tasks without stopping. For each task:
  1. failing tests first → green → refactor;
  2. `pnpm gate --only <folders it touched>` green;
  3. tick Status and add a log line at the bottom;
  4. commit, then push.
- **Commits** are conventional, with no scope: `feat: …`, `fix: …`, `refactor: …`, `docs: …`, `test: …`, `chore: …`. The subject names the change; the task id lives here.
- **End of a checkpoint:** run `pnpm gate` and `pnpm e2e`, then stop and report:
  - what was built, with commit hashes;
  - the gate's table and the e2e result;
  - anything deferred;
  - any ADR that changes the TRD.

  Don't start the next checkpoint until Naresh says so.
- Never start a task whose checkpoint Plan cell is ⬜. **Checkpoints C–E are 🔒** until TRD §7 is settled and the TRD marks §5–6 decided; don't plan them before that.
- Not covered by the PRD, TRD or an ADR? Stop and ask. Record the decision as the next ADR (from 0111; 0111 and 0112 are reserved for Metis and to-dos) and add its number to the task's ADR column.
- **Behaviour-neutral means behaviour-neutral.** Tasks marked *(neutral)* must not change what any endpoint returns or any page shows. Existing tests pass unchanged except imports; list any other change in the log line.
- **Data (ADRs 0084, 0085):** each migration is written test-first against the seed of the schema it starts from, and locked only in the release checkpoint. Nothing resets or hand-edits the VM's database.
- **No test touches the network, the metadata server, Claude, Gemini, Google, Obsidian or a real vault.** The VM, GCP, the bucket and the Claude Console are Naresh's: Claude Code never runs a command against them.
- **Logs:** IDs and paths only. Never note text, goal names, calendar event titles, identity or access tokens, statement contents, merchant names or amounts (ADR 0049).
- Update `docs/architecture.md` and the app `CLAUDE.md` files in the same commit as the part they describe.

---

## Checkpoint A: Kick-off and hygiene
**Plan:** ✅ [`plans/checkpoint-a.md`](plans/checkpoint-a.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 1.1 | Version 1.3.0 in every `package.json`, `apps/agent/pyproject.toml` and its `uv.lock` entry; root `CLAUDE.md` names 1.3.0; `docs/README.md` lists v1.3.0 and ADR 0110; `nameGuard.test.mjs` `HISTORY` if needed; commit this folder's docs and ADR 0110 (TRD §2.1) | 0110 | ✅ |
| 1.2 | `@anthropic-ai/sdk` 1.6 → 1.7 or newest 1.x past `minimumReleaseAge`, no waiver; `test:integration` by Naresh afterwards, result in the log (TRD §2.4) | | ✅ |
| 1.3 | `vitest.integration.config.ts` placeholders for the non-Claude variables; "A local `.env` for development" in `configuration.md` (TRD §2.3) | | ✅ |
| 1.4 | `study_today` on `Me`; Log time dialog default and max from it; dialog test with the device a day ahead; `themis.spec.ts` green in local time (TRD §2.2) | | ✅ |
| 1.5 | Flaky tests: three `pnpm gate` runs; cause fixed or "not reproduced in 3 runs" logged, never a raised timeout (TRD §2.6) | | ✅ |
| 1.6 | Major bump `jsdom` 31 (TRD §2.5) — only once PRD §9.7 is confirmed, else ⏸️ | | ⏸️ |

**Checkpoint A done when:** the gate and e2e are green in local time +08, `test:integration` runs with only the key, and the SDK is on 1.7.

---

## Checkpoint B: Workload Identity Federation
**Plan:** ✅ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 2.1 | *(neutral)* Express: one shared `Anthropic` client in `clients/anthropic.ts`; `claude.client.ts` and `anthropicModels.client.ts` pass `timeout` and `maxRetries` per request (TRD §4.5) | 0110 | ✅ |
| 2.2 | Express config: `claudeAuth` modes and refusals; the shared client sends no `apiKey` under federation; credentials-cache check (`ANTHROPIC_CONFIG_DIR` if needed) (TRD §4.5) | 0110 | ✅ |
| 2.3 | Agent: `config.py` modes and refusals; `AsyncAnthropic()` under federation; confirm `anthropic` 2.x resolves the federation variables; `/health` reports `claude_credential` in the contract, Zod regenerated (TRD §4.6) | 0110 | ✅ |
| 2.4 | Migration 20 test-first against `schema-19.sql`, not locked; `AppHealthKind` gains `claude`; Claude API check and row; agent row shows its credential source (TRD §3, §4.7) | 0085, 0110 | ✅ |
| 2.5 | `deploy/vm/fetch-identity-token.sh` with its `node:test`; `atlas-identity-token.service` and `.timer`; `atlas.service` `ExecStartPre`; `bootstrap.sh` and `deploy.sh` install them, tests extended (TRD §4.3) | 0110 | ✅ |
| 2.6 | Compose: `ANTHROPIC_API_KEY` out of `docker-compose.yml`, into `compose.local.yml` for the agent; federation variables and the token mount in `compose.prod.yml`; `atlas.env.example`; `fetch-secrets.sh` drops `anthropic-api-key` (TRD §4.4) | 0110 | ✅ |
| 2.7 | Docs: `deploy.md` (Console setup, IDs, helper, cut-over, revoke later), `google-cloud-setup.md`, `configuration.md` (never blank), `architecture.md` (TRD §4.8) | 0110 | ✅ |

**Checkpoint B done when:** both services start in either mode and refuse a mixed or partial setup, the helper is tested and installed by bootstrap and deploy, Compose never names the key on the VM, and the Status panel shows the credential source. The VM cut-over itself is Naresh's, in checkpoint F.

---

## Checkpoint C: Metis backend 🔒
**Plan:** ⬜ [`plans/checkpoint-c.md`](plans/checkpoint-c.md) — blocked on TRD §7 and the DBS fixtures

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 3.1 | `ModuleId` gains `metis`; module guard and drawer entry; migration 21 test-first against `schema-20.sql` (TRD §5.1–5.2) | 0111 | 🔒 |
| 3.2 | Accounts CRUD; category seeding; rules (pure matcher) (TRD §5.2, §5.6) | 0111 | 🔒 |
| 3.3 | Upload route; DBS CSV parser from the fixture; import → review lines (TRD §5.3–5.4) | 0111 | 🔒 |
| 3.4 | `extractCardStatement`; pure reconciliation; blocked state; usage recorded (TRD §5.5) | 0111 | 🔒 |
| 3.5 | `suggestCategories`; "always" saves a rule and reapplies (TRD §5.6) | 0111 | 🔒 |
| 3.6 | Fingerprints, duplicates, transfer candidates; review edits; post and discard (TRD §5.7) | 0111 | 🔒 |
| 3.7 | Read endpoints: overview, ledger, spending, net worth, coverage; Themis signal (TRD §5.8–5.9) | 0111 | 🔒 |

---

## Checkpoint D: Metis UI 🔒
**Plan:** ⬜ [`plans/checkpoint-d.md`](plans/checkpoint-d.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 4.1 | `features/metis`: overview and accounts | 0111 | 🔒 |
| 4.2 | Import flow: upload, processing, review with reconciliation, duplicates and transfers; phone layout | 0111 | 🔒 |
| 4.3 | Ledger, categories and rules | 0111 | 🔒 |
| 4.4 | Spending and net worth; Settings prompts and models for Metis | 0111 | 🔒 |

---

## Checkpoint E: To-dos 🔒
**Plan:** ⬜ [`plans/checkpoint-e.md`](plans/checkpoint-e.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 5.1 | Migration 22 test-first against `schema-21.sql`; to-dos API (TRD §6) | 0112 | 🔒 |
| 5.2 | To-dos UI; Home **Due today** card (to-dos and Melete reviews due) (TRD §6) | 0112, 0109 | 🔒 |

---

## Checkpoint F: Release
**Plan:** ⬜ [`plans/checkpoint-f.md`](plans/checkpoint-f.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 6.1 | E2E: Metis CSV import path and the to-dos card against local fakes (TRD §8) | 0111, 0112 | ⬜ |
| 6.2 | Docs final pass; `docs/v1.3.0/release-notes.md` | | ⬜ |
| 6.3 | `fixtures/schema-22.sql`; lock migrations 20–22; upgrade tests green (TRD §9) | 0085 | ⬜ |
| 6.4 | **Naresh:** Console setup, IDs in `atlas.env`, `release.sh 1.3.0`, `deploy.sh 1.3.0` on the release branch, cut-over check (TRD §4.9), merge, tag; later, revoke the key and delete the secret | 0110 | ⬜ |

**Checkpoint F done when:** `pnpm gate` and `pnpm e2e` are green, migrations are locked, the release notes are written, and the VM runs on federation. 6.4 is Naresh's.

---

## Deferred
- 1.6 `jsdom` 31: PRD §9.7 still says "proposed"; not confirmed by Naresh.

## Log
_(one line per ticked task: id, commit hash, moved or deleted test files)_
- 1.1: version 1.3.0 everywhere (six package.json, pyproject, uv.lock); README and root CLAUDE.md updated; nameGuard HISTORY gains docs/v1.3.0/ and ADR 0110; no test files moved.
- 1.1 hash: ba75fca.
- 1.2: `@anthropic-ai/sdk` ^1.6.0 → ^1.8.0 (newest 1.x pnpm resolves under its default `minimumReleaseAge`: 1.8.0 is ~39 h old; 1.7 was the TRD's floor, no waiver). Server gate green. **Naresh: run `pnpm --filter @atlas/server test:integration` and add the result here.** No test files moved.
- 1.2 hash: 9c90982.
- 1.3: `applyIntegrationPlaceholders` in `src/test-support/integrationEnv.ts` (tested), wired into `vitest.integration.config.ts` after `.env` loads; empty counts as unset; `configuration.md` gains "A local `.env` for development" (the old dev bullet now points at it). No test files moved.
- 1.3 hash: f18d944.
- 1.4: `Me.study_today` (shared, `getMe` via `studyDay`); `LogTimeDialog` default, `max` and `min` come from it (new `dayBefore` in `lib/localDate.ts`); tests: shared schema, `/api/me` across the 04:00 boundary, dialog with the device clock a day ahead, `dayBefore`; `meFixture` gains the field; architecture.md updated. `themis.spec.ts` in local time +08 runs with the checkpoint's e2e (Docker). **Naresh: confirm `APP_TIME_ZONE=Asia/Singapore` in `/etc/atlas/atlas.env`.** No test files moved.
- 1.4 hash: 4b3109d.
- 1.5: not reproduced in 3 runs (`pnpm gate`, 18 of 18 steps passed each time, local time +08); nothing changed, no timeout raised.
- 1.6: ⏸️ deferred, PRD §9.7 "proposed" (see Deferred).
- Plan B hash: 92cbeb9.
- 2.1: `clients/anthropic.ts` `getAnthropic()` (one client per process, `apiKey` only); `claude.client.ts` (3 calls) and `anthropicModels.client.ts` pass `timeout`/`maxRetries` per request. Behaviour-neutral. Changed tests (assertion moved from the constructor options to the per-request options, same values): `claude.client.test.ts` (6 "builds the client…" cases, `constructed` removed) and `anthropicModels.client.test.ts` (1 case); new `anthropic.test.ts`. No test files moved.
- 2.1 hash: 08a304e.
- 2.2: `config.claudeAuth` (`api_key` | `federation`) replaces `anthropicApiKey`; refusals for both modes, neither, partial, empty key beside federation, missing token file; `getAnthropic()` sends no `apiKey` under federation. SDK 1.8 finding: the env-only federation chain keeps its token in memory and writes no credentials cache (`credential-chain.js`: "env-only chain stays in-memory only"), so **no `ANTHROPIC_CONFIG_DIR` is needed** in 2.6. Changed existing tests: `envExample.test.ts` "puts the variables config.ts requires under Required" now asserts `ANTHROPIC_API_KEY` is *not* in Required (TRD §4.5 makes it conditional; the schema's whole-object check hides it from the "→ at" scan); `config.test.ts` two expectations `anthropicApiKey` → `claudeAuth` and the old "throws naming ANTHROPIC_API_KEY" case now also names the federation variables; client tests' mock config `anthropicApiKey` → `claudeAuth`. `apps/server/.env.example` gained the federation variables under "Claude credentials". No test files moved.
- 2.2 hash: 169706f.
- 2.3: agent `Settings.claude_auth` (`ClaudeAuth`: `api_key` | `federation`) with the same refusals as Express (both, neither, partial, empty key beside federation, missing token file); `AnthropicClaude( None )` builds `AsyncAnthropic` without `api_key`; `GET /health` answers `claude_credential`. Contract change in this one commit: `AgentHealthResponse` + `ClaudeCredential` (named `Agent…` because `@atlas/shared` already exports `HealthResponse` for the server's own `/health`), `link_contract.json`, four golden examples (2 valid, 2 invalid), `agent.generated.ts`. Python `anthropic` 2.6.0 (locked) reads `ANTHROPIC_FEDERATION_RULE_ID`, `_ORGANIZATION_ID`, `_SERVICE_ACCOUNT_ID`, `_WORKSPACE_ID`, `_IDENTITY_TOKEN_FILE` in `lib/credentials/_constants.py`: no bump needed. Changed existing tests (mandated by TRD §4.6): `test_config.py` (`anthropic_api_key` assertion → `claude_auth`; the "missing key" case now also names the federation variables), `conftest.py` and `test_link_route.py` (`settings.anthropic_api_key` → `settings.claude_auth.key`), `test_main.py` (`/health` body gains `claude_credential`; secret-leak check uses `claude_auth.key`), and the example/export lists in `test_examples.py`, `test_export.py`, `agent.examples.test.ts`. The server does not yet read the new field (2.4). No test files moved.
- 2.3 hash: 5fa563a.
- 2.4: migration 20 (`20-claude-health-kind.sql`, from `schema-19.sql`, no count change, **not locked**); `AppHealthKind` gains `claude`; `checkClaude` (`models.list( { limit: 1 } )` through the shared client, 10 s, no retries; failure records the error class and status only) with detail `{ source }`; the Claude row ("Claude API (federation)" / "(API key)", after Transcription); `agentCredential()` in `agent.client.ts` reads `claude_credential` from `/health`, stored as the agent row's detail and shown as "Claude credential: federation | API key". The web panel needed only a `claude: 'Service'` label. e2e passes (the fakes already serve `/v1/models`). Changed existing tests (all because the admin's rows or the CHECK list gained `claude`): `status.test.ts` (shared: `AppHealthKind` options), `database.schema.test.ts` (kind CHECK string), `status.service.test.ts` (5 row-list/name expectations plus the config mock), `status.routes.test.ts` (1 row list), `health.service.test.ts` and `agent.client.test.ts` (mocks gain `agentCredential`/`getAnthropic`; additions only). No test files moved.
- 2.4 hash: ac30215.
- 2.5: `deploy/vm/fetch-identity-token.sh` (JWT-shaped answer only, temp file then `mv`, 0755 folder / 0644 file, never prints the token) with `fetch-identity-token.test.mjs` (also covers the unit and timer files and `atlas.service`'s `ExecStartPre` order); `atlas-identity-token.service` (oneshot) and `.timer` (`OnBootSec=0`, `OnUnitActiveSec=20min`); `atlas.service` runs the helper after `fetch-secrets.sh`. `bootstrap.sh` installs the script and both units and enables the timer (guarded by `is-enabled`, so a second run changes nothing); `deploy.sh --files` installs them beside `atlas.service`, reloads systemd once and runs `systemctl enable --now atlas-identity-token.timer`. Changed existing tests (additions only): `bootstrap.test.mjs` (what the unit runs, and the checkout file list), `deploy.test.mjs` (the `--files` case). No test files moved.
- 2.5 hash: 001f3d2.
- 2.6: `docker-compose.yml` no longer names `ANTHROPIC_API_KEY` for either service; `compose.local.yml` gives the agent the key (`:?`, the app still reads it from `.env`); `compose.prod.yml` gives both services the four IDs (`:?`, from `atlas.env`), `ANTHROPIC_IDENTITY_TOKEN_FILE=/run/anthropic/token` and the `/run/atlas/identity:/run/anthropic:ro` folder mount, and never names the key (a test scans for it and for any `${ANTHROPIC_API_KEY:-…}`); no `ANTHROPIC_CONFIG_DIR` (2.2 finding); `atlas.env.example` has the four IDs; `fetch-secrets.sh` reads five secrets. e2e compose is untouched and passes (10 of 10). Changed existing tests: `compose.test.mjs` ("the app gets every variable…" drops `ANTHROPIC_API_KEY`; "a missing required variable stops the shared file" now removes `AGENT_SECRET`, and the key's own refusal moved to a local-render test; `prodEnv` gains the IDs and drops the key), `fetch-secrets.test.mjs` (five secrets). No test files moved.
- 2.6 hash: d9a0221.
- 2.7: `deploy.md` (new "Claude sign-in: Workload Identity Federation (from 1.3)": Console setup, the four IDs, helper and timer, cut-over check, revoke-later, rollback note, troubleshooting; five secrets; rotation example no longer the Claude key), `google-cloud-setup.md` (service-account note), `configuration.md` (variables and the never-blank rule), `architecture.md` (Claude credentials paragraph; Status line), `apps/agent/CLAUDE.md` and `apps/server/CLAUDE.md`. No test files moved.
