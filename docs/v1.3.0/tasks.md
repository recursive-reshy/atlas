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
| 1.1 | Version 1.3.0 in every `package.json`, `apps/agent/pyproject.toml` and its `uv.lock` entry; root `CLAUDE.md` names 1.3.0; `docs/README.md` lists v1.3.0 and ADR 0110; `nameGuard.test.mjs` `HISTORY` if needed; commit this folder's docs and ADR 0110 (TRD §2.1) | 0110 | ⬜ |
| 1.2 | `@anthropic-ai/sdk` 1.6 → 1.7 or newest 1.x past `minimumReleaseAge`, no waiver; `test:integration` by Naresh afterwards, result in the log (TRD §2.4) | | ⬜ |
| 1.3 | `vitest.integration.config.ts` placeholders for the non-Claude variables; "A local `.env` for development" in `configuration.md` (TRD §2.3) | | ⬜ |
| 1.4 | `study_today` on `Me`; Log time dialog default and max from it; dialog test with the device a day ahead; `themis.spec.ts` green in local time (TRD §2.2) | | ⬜ |
| 1.5 | Flaky tests: three `pnpm gate` runs; cause fixed or "not reproduced in 3 runs" logged, never a raised timeout (TRD §2.6) | | ⬜ |
| 1.6 | Major bump `jsdom` 31 (TRD §2.5) — only once PRD §9.7 is confirmed, else ⏸️ | | ⬜ |

**Checkpoint A done when:** the gate and e2e are green in local time +08, `test:integration` runs with only the key, and the SDK is on 1.7.

---

## Checkpoint B: Workload Identity Federation
**Plan:** ⬜ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 2.1 | *(neutral)* Express: one shared `Anthropic` client in `clients/anthropic.ts`; `claude.client.ts` and `anthropicModels.client.ts` pass `timeout` and `maxRetries` per request (TRD §4.5) | 0110 | ⬜ |
| 2.2 | Express config: `claudeAuth` modes and refusals; the shared client sends no `apiKey` under federation; credentials-cache check (`ANTHROPIC_CONFIG_DIR` if needed) (TRD §4.5) | 0110 | ⬜ |
| 2.3 | Agent: `config.py` modes and refusals; `AsyncAnthropic()` under federation; confirm `anthropic` 2.x resolves the federation variables; `/health` reports `claude_credential` in the contract, Zod regenerated (TRD §4.6) | 0110 | ⬜ |
| 2.4 | Migration 20 test-first against `schema-19.sql`, not locked; `AppHealthKind` gains `claude`; Claude API check and row; agent row shows its credential source (TRD §3, §4.7) | 0085, 0110 | ⬜ |
| 2.5 | `deploy/vm/fetch-identity-token.sh` with its `node:test`; `atlas-identity-token.service` and `.timer`; `atlas.service` `ExecStartPre`; `bootstrap.sh` and `deploy.sh` install them, tests extended (TRD §4.3) | 0110 | ⬜ |
| 2.6 | Compose: `ANTHROPIC_API_KEY` out of `docker-compose.yml`, into `compose.local.yml` for the agent; federation variables and the token mount in `compose.prod.yml`; `atlas.env.example`; `fetch-secrets.sh` drops `anthropic-api-key` (TRD §4.4) | 0110 | ⬜ |
| 2.7 | Docs: `deploy.md` (Console setup, IDs, helper, cut-over, revoke later), `google-cloud-setup.md`, `configuration.md` (never blank), `architecture.md` (TRD §4.8) | 0110 | ⬜ |

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
_(none yet)_

## Log
_(one line per ticked task: id, commit hash, moved or deleted test files)_
