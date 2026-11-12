# Checkpoint B: Workload Identity Federation (v1.3.0, tasks 2.1–2.7, ADR 0110)

Branch `release/1.3.0`. One commit per task, pushed after each; `pnpm gate --only <folders>` per task; `pnpm gate` + `pnpm e2e` at the end. On approval: save to `docs/v1.3.0/plans/checkpoint-b.md`, tick Plan cell, commit, push. No test touches the network or metadata server; the VM cut-over is Naresh's (F).

Facts found: three `new Anthropic( { apiKey: config.anthropicApiKey … } )` call sites in `claude.client.ts` (summary 1 retry; `callStructured` 1 retry, timeout param; `gradeAnswer` 0 retries) plus one in `anthropicModels.client.ts`; `config.ts:135` requires the key; agent `config.py` `anthropic_api_key`, `claude.py` `AnthropicClaude(api_key)`, `main.py:189`; `/health` returns `{status, vault}`; status rows in `status.service.ts`, kinds in `packages/shared/src/status.ts`; `deploy/vm` has `fetch-secrets.sh`, `atlas.service`, `bootstrap.sh`, `deploy.sh` each with a `.test.mjs`; latest seed `schema-19.sql`, latest migration `19-calendar-and-time.sql`.

## 2.1 One shared client (neutral)
- Red first: a `clients/anthropic.test.ts` (spy on the `Anthropic` constructor): one instance per process however many calls; and in `claude.client.test.ts` / `anthropicModels.client.test.ts` that `timeout` and `maxRetries` arrive as the second (per-request) argument of `messages.parse` / `models.list`. Existing assertions otherwise unchanged (mock shape moves only by import).
- New `apps/server/src/clients/anthropic.ts`: lazy singleton `getAnthropic()` (`apiKey: config.anthropicApiKey`, nothing else). Replace the four constructions; pass `{ timeout, maxRetries }` per request (summary: `summaryTimeoutMs`, 1; structured: its `timeoutMs`, 1; grading: `gradingTimeoutMs`, 0; models list: `summaryTimeoutMs`, 1).
- Log line lists any changed existing test. Gate `--only server`.

## 2.2 Express config modes
- Red: `config.test.ts` cases — valid `api_key`; valid federation (all five vars, token file exists in a temp dir); refusals naming variables: key + any federation var; neither; partial federation; empty `ANTHROPIC_API_KEY` with federation ("unset it, don't blank it"); token file missing at start. The existing "throws naming ANTHROPIC_API_KEY when undefined or empty" becomes the "neither" case.
- `config.ts`: key optional; add `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID`, `ANTHROPIC_WORKSPACE_ID`, `ANTHROPIC_IDENTITY_TOKEN_FILE`; `config.claudeAuth = { kind: 'api_key', key } | { kind: 'federation' }` replaces `anthropicApiKey` (update the other test configs that set it: `claude.client.test.ts`, `anthropicModels.client.test.ts`, `config.test.ts`).
- `clients/anthropic.ts`: passes `apiKey` only for `api_key`; under federation the constructor gets no `apiKey` (test via constructor spy).
- Verify in the installed SDK 1.8 (read `core/credentials*` / credential chain; note `node_modules` also holds an old 0.137.0 copy, check which one the server resolves) that the env path reads those variables and whether it writes a credentials cache under a config dir; if so add `ANTHROPIC_CONFIG_DIR` (writable tmpfs) to the 2.6 Compose work and log it.
- Gate `--only server`.

## 2.3 Agent
- Red: `tests/test_config.py` — same modes/refusals as 2.2 (mirror messages); `tests/test_main.py` — `/health` returns `claude_credential` (`api_key` or `federation`); `tests/test_claude.py` — under federation `AsyncAnthropic` gets no `api_key` (monkeypatch constructor).
- `config.py`: `Settings.claude_auth` (replaces `anthropic_api_key`; update `conftest.py`, `test_main.py`, `test_link_route.py` secret checks); `claude.py` / `main.py:189` build `AsyncAnthropic()` with no key under federation.
- Contract change in one commit: Pydantic health model in `src/atlas_agent/contract/`, JSON Schema export, golden examples, `pnpm --filter @atlas/shared generate:agent` → `agent.generated.ts`; server's agent client parser accepts the new field (shared Zod).
- Confirm locked `anthropic` 2.x resolves the federation variables (read `lib/credentials/_providers.py`); if not, bump within 2.x, never a waiver; if 2.x lacks it, stop and ask.
- `tests/docker/test_container.py` keeps a key. Gate `--only agent,shared,server`.

## 2.4 Migration 20 and the Claude status row
- Test first (ADRs 0084, 0085, 0099): `database.upgrade.test.ts` case from `fixtures/schema-19.sql` (already exists as `src/repositories/fixtures/schema-19.sql`; no new seed since it starts from 19) — every row of `health_status` and `health_errors` survives, no `ALLOWED_COUNT_CHANGES` entry, `claude` kind now accepted. New `sql/20-claude-health-kind.sql` rebuilding both tables as migration 13 did (copy its pattern), CHECK `kind IN ( 'agent', 'transcription', 'replication', 'claude' )`; append to `migrationFiles` in `database.ts`. **Not locked** (locked in F, 6.3).
- `AppHealthKind` gains `claude` (`packages/shared/src/status.ts` + test). Status: admin refresh runs `models.list( { limit: 1 } )` through the shared client, records ok/failing with detail `{ source }`; row "Claude API (federation)" / "Claude API (API key)"; Agent service row shows the agent's credential source from `/health`. Failure shows SDK error class and status only. Web Status panel renders the new row (test first in the web component test).
- Gate `--only shared,server,web`.

## 2.5 Host helper and units
- Red: `deploy/vm/fetch-identity-token.test.mjs` (fake `curl` as `fetch-secrets.test.mjs` does): writes token; refuses non-JWT (three base64url segments); keeps the old file on failure; never prints the token; folder 0755 / file 0644; `METADATA_URL`, `IDENTITY_TOKEN_DIR`, `IDENTITY_AUDIENCE` overridable. Extend `bootstrap.test.mjs` and `deploy.test.mjs` for installing the script, `atlas-identity-token.service` and `.timer` (enabled), and `atlas.service` `ExecStartPre` order.
- Add `fetch-identity-token.sh`, `atlas-identity-token.service` (oneshot), `atlas-identity-token.timer` (`OnBootSec=0`, `OnUnitActiveSec=20min`); `atlas.service` gets `ExecStartPre=/opt/atlas/fetch-identity-token.sh` after `fetch-secrets.sh`; update `bootstrap.sh`, `deploy.sh`. Gate `--only root`.

## 2.6 Compose and secrets
- Red: `scripts/compose.test.mjs` — the base file never names `ANTHROPIC_API_KEY`; no file uses `${ANTHROPIC_API_KEY:-}`; local render needs the key for the agent (`:?`); prod render requires the four IDs and has `ANTHROPIC_IDENTITY_TOKEN_FILE: /run/anthropic/token` and the `/run/atlas/identity:/run/anthropic:ro` volume on both services (plus `ANTHROPIC_CONFIG_DIR` tmpfs if 2.2 found it necessary). `fetch-secrets.test.mjs` expects five secrets.
- Edit `docker-compose.yml` (drop key from both services), `compose.local.yml` (agent gets the key), `compose.prod.yml`, `deploy/vm/atlas.env.example` (four IDs, commented, Console path), `fetch-secrets.sh` (drop `anthropic-api-key`). e2e compose keeps `ANTHROPIC_API_KEY: e2e`; check `e2e/run.sh` still starts. Gate `--only root,e2e`.

## 2.7 Docs
`deploy.md` (Console setup, IDs, helper/timer, cut-over check, revoke-later, rollback note), `google-cloud-setup.md` (service account), `configuration.md` (variables, never-blank rule, Mac keeps a key), `architecture.md` (Claude credentials paragraph), app `CLAUDE.md`s where they name the key; `.env.example` comments stay. `hostingDocs.test.mjs` extended if it pins sections.

## End
`pnpm gate`, `pnpm e2e` (Docker). Report: hashes, gate table, e2e, ADRs (none new; 0110 already accepted), SDK cache finding, anything deferred; migration 20 is unlocked until F. Done when both services start in either mode and refuse mixed/partial setups, helper tested and installed by bootstrap/deploy, Compose never names the key on the VM, Status shows the credential source.
