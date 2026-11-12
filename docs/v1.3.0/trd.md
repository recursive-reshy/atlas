# Atlas v1.3.0 — Technical Requirements

Built from `prd.md` in this folder. Sections 2–4 (kick-off, hygiene, WIF) are decided (2026-11-12, ADR 0110). Sections 5–7 (Metis, to-dos) are **proposals** until PRD §9 is settled; Claude Code doesn't plan checkpoints C–E until they are marked decided.

## 1. Changes at a glance
| Area | Change | ADR | State |
| --- | --- | --- | --- |
| Hygiene | `study_today` on `Me`; Log time dialog uses it | — | Decided |
| Hygiene | `vitest.integration.config.ts` placeholders; local `.env` list in `configuration.md` | — | Decided |
| Dependency | `@anthropic-ai/sdk` 1.6 → 1.7 (minor, no ADR) | — | Decided |
| Dependency | Major bump: `jsdom` 30 → 31 | — | Proposed (PRD §9.7) |
| Tests | Flaky `linkJob.test.ts`, `promptProfiles.routes.test.ts`: cause or "not reproduced" | — | Decided |
| Claude auth | WIF on the VM for Express and the agent; API key on the Mac; identity-token helper; Claude status row; migration 20 | 0110 | Decided |
| Metis | Accounts, imports (CSV, PDF + reconciliation), review, categories and rules, transfers, ledger, dashboards, net worth; migration 21 | 0111 (to write) | Proposed |
| To-dos | To-dos and Home's Due today card; migration 22 | 0112 (to write) | Proposed |

## 2. Kick-off and hygiene

### 2.1 Version and docs
Version 1.3.0 in every `package.json`, `apps/agent/pyproject.toml` and its `uv.lock` entry. Root `CLAUDE.md` names 1.3.0 and `docs/v1.3.0/`. `docs/README.md` lists v1.3.0 and ADR 0110. `nameGuard.test.mjs` `HISTORY` gains `docs/v1.3.0/` and ADR 0110 if they name Mnemosyne as a module. v1.2.0 is already closed off (task 6.4 of 1.2, restore drill done), so nothing of 1.2 is left to tick.

### 2.2 `study_today`
- `Me` (`packages/shared/src/auth.ts`) gains `study_today: z.iso.date()`, the server's `studyDay( new Date() )` at request time (`APP_TIME_ZONE`, `MELETE_DAY_START_HOUR`).
- Chosen over the Themis overview because Home and Melete also need the server's day; `Me` is already loaded on every page.
- `LogTimeDialog` takes `study_today` from `useMe` as its default day and the date field's `max`. It never reads the device's date. The server check in `time.service.ts` is unchanged.
- Tests: a dialog test with the device clock a day ahead of `study_today` (default and max are `study_today`); `GET /api/me` returns it across the day-start boundary; `themis.spec.ts` passes in local time +08 (remove any `TZ=UTC` reliance from `e2e/run.sh` docs).
- Not chosen: the server accepting a day up to one ahead.
- Ops (Naresh): confirm `APP_TIME_ZONE=Asia/Singapore` in `/etc/atlas/atlas.env`.

### 2.3 `test:integration`
- `apps/server/vitest.integration.config.ts` sets placeholders for `GEMINI_MODEL`, `GEMINI_API_KEY`, `YOUTUBE_API_KEY`, `ADMIN_EMAIL`, `APP_ORIGINS` (as `vitest.config.ts` does), applied only when the variable is unset after `.env` is loaded, so a real value wins.
- Tests still skip without `ANTHROPIC_API_KEY`.
- `docs/configuration.md` gains "A local `.env` for development": the variables a current file needs, and that pre-0.10 entries (`WHISPER_URL`, `VAULT_PATH`) are ignored.
- After §4 the integration tests keep using the API key path (the Mac never federates).

### 2.4 SDK minor bump
`@anthropic-ai/sdk` to 1.7, or the newest 1.x that passes `minimumReleaseAge`. Never a `minimumReleaseAgeExclude` waiver. No ADR. Done before §4, because federation relies on the SDK's credential chain. Naresh runs `test:integration` once afterwards.

### 2.5 Major bump: `jsdom` 31 (proposed)
`apps/web` devDependency `jsdom` ^30 → ^31. Test-only. Read its changelog; fix test-environment breaks without changing component code. ADR 0107 already deferred it to a later release.

### 2.6 Flaky tests
Run `pnpm gate` three times. If neither test fails, log "not reproduced in 3 runs" and close. If one fails, find the cause (shared state between files, a slow `beforeEach`, a real timer wait) and fix it. Raising `testTimeout` is not a fix. 1.2's log saw `promptProfiles.routes.test.ts` take about 7 s alone, so look at its setup first.

## 3. Migrations
Rules as in the root `CLAUDE.md` and ADRs 0084, 0085, 0099.

- **20 — Claude health kind** (seed `schema-19.sql`): rebuild `health_status` and `health_errors` as migration 13 did, the app-kind `CHECK` becoming `kind IN ( 'agent', 'transcription', 'replication', 'claude' )`. Every row survives. No count change.
- **21 — Metis** (seed `schema-20.sql`): §5.2. Proposed.
- **22 — To-dos** (seed `schema-21.sql`): §6. Proposed.

## 4. Workload Identity Federation (ADR 0110)

### 4.1 How it works
- The VM's service account `atlas-vm` (user-managed, as WIF requires) gets a Google-signed identity token from the metadata server, audience `https://api.anthropic.com`, `format=full`.
- A host helper writes it to `/run/atlas/identity/token`. Both containers mount `/run/atlas/identity` read-only at `/run/anthropic` (a directory mount, so the helper's atomic rename is seen; a single-file bind mount would keep the old inode).
- Each SDK reads the file through `ANTHROPIC_IDENTITY_TOKEN_FILE`, exchanges it at `POST /v1/oauth/token` for a short-lived Claude API token, and refreshes on its own. The SDK re-reads the file on every exchange.
- Express and the agent resolve credentials from the environment (no `apiKey` constructor argument) when federation is configured.

### 4.2 Console setup (Naresh, before checkpoint B's VM check)
In the Claude Console › Settings › Workload identity › Connect workload › Google Cloud:
- Issuer: Google, discovery mode (`https://accounts.google.com`).
- An Anthropic service account `atlas-vm`, member of the workspace Atlas uses.
- A rule matching the `atlas-vm` service account (its `email` or unique `sub`), audience pinned to `https://api.anthropic.com`, and a `google.compute_engine.project_id` condition for the Atlas project.
- Record the rule, organization, service-account and workspace IDs for `/etc/atlas/atlas.env`. They are identifiers, not secrets, so they don't go in Secret Manager.

### 4.3 Identity-token helper (`deploy/vm/`)
- `fetch-identity-token.sh`: `curl -fsS -H 'Metadata-Flavor: Google' "$METADATA/instance/service-accounts/default/identity?audience=$AUDIENCE&format=full"`. It refuses an answer that isn't three base64url segments, writes to a temporary file in the target folder, then `mv`s into place. Folder `0755`, file `0644` (the containers run as uid 1000; the token is short-lived and only useful at Anthropic for this rule). It never prints the token. `METADATA_URL`, `IDENTITY_TOKEN_DIR`, `IDENTITY_AUDIENCE` are overridable for tests.
- `atlas-identity-token.service` (oneshot, runs the script) and `atlas-identity-token.timer` (`OnBootSec=0`, `OnUnitActiveSec=20min`). Google identity tokens last an hour, so a refresh every 20 minutes always leaves a valid one.
- `atlas.service` gains `ExecStartPre=/opt/atlas/fetch-identity-token.sh`, after `fetch-secrets.sh`, so the stack never starts without a token.
- `bootstrap.sh` and `deploy.sh` install the script and both units and enable the timer.
- `fetch-identity-token.test.mjs` (`node:test`, fake `curl`, as `fetch-secrets.test.mjs` does): writes the token, refuses a non-JWT, leaves the old file in place on failure, never prints the value. Extend `bootstrap.test.mjs` and `deploy.test.mjs` for the install steps.

### 4.4 Compose
- `docker-compose.yml`: `ANTHROPIC_API_KEY` leaves both services' `environment`.
- `compose.local.yml`: the app already reads `.env` through `env_file`; the agent gains `ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:?Set ANTHROPIC_API_KEY in .env}`.
- `compose.prod.yml`: both services gain `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID`, `ANTHROPIC_WORKSPACE_ID` (each `:?` required, from `atlas.env`), `ANTHROPIC_IDENTITY_TOKEN_FILE: /run/anthropic/token` and the volume `/run/atlas/identity:/run/anthropic:ro`.
- **Never blank:** no Compose file names `ANTHROPIC_API_KEY` as `${…:-}`. An exported empty key makes the SDK take the API-key path with an empty key instead of federating.
- e2e compose keeps `ANTHROPIC_API_KEY: e2e` against the fake.
- `deploy/vm/atlas.env.example` gains the four IDs (commented, with the Console path). `fetch-secrets.sh` drops `anthropic-api-key` (five secrets); its test changes to match.

### 4.5 Express
- `config.ts`: `ANTHROPIC_API_KEY` becomes optional. New optional `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID`, `ANTHROPIC_WORKSPACE_ID`, `ANTHROPIC_IDENTITY_TOKEN_FILE`. `config.claudeAuth` is `{ kind: 'api_key', key }` or `{ kind: 'federation' }`.
- Refuse to start, naming the variables, when: both a key and any federation variable are set; neither is set; federation is partly set; `ANTHROPIC_API_KEY` is present but empty while federation is set ("unset it, don't blank it"); or the token file doesn't exist at start.
- **One client per process.** New `clients/anthropic.ts` creates a single `Anthropic` instance (passing `apiKey` only for `api_key`). `claude.client.ts` (three call sites) and `anthropicModels.client.ts` use it, passing `timeout` and `maxRetries` as per-request options. Today a client is built per call, which with federation would mean a token exchange per call. This refactor is behaviour-neutral and lands before the auth change.
- Check whether the SDK's environment federation path writes a credentials cache under its config folder. If it does, set `ANTHROPIC_CONFIG_DIR` to a writable tmpfs path in `compose.prod.yml` for both services.
- Test-first: config cases (each refusal, each valid mode), the shared client receives no `apiKey` under federation (spy on the constructor), and per-request options reach the SDK.

### 4.6 Agent service
- `config.py`: the same modes and refusals. `Settings.claude_auth` replaces `anthropic_api_key`.
- `AnthropicClaude` builds `AsyncAnthropic()` with no `api_key` under federation; unchanged otherwise. It is already one client per process.
- Confirm the locked `anthropic` 2.x resolves the federation environment variables. If not, bump within 2.x (no waiver); stop and ask if 2.x lacks it.
- `GET /health` gains `claude_credential: "federation" | "api_key"` (in the Pydantic contract, regenerated Zod). The server's agent check stores it in the Agent service row's detail.
- `tests/test_config.py` and `tests/test_main.py` cover the modes. `tests/docker/test_container.py` still runs with a key.

### 4.7 Status: Claude API row
- `AppHealthKind` gains `claude` (migration 20). The admin's status refresh runs a check: `models.list( { limit: 1 } )` through the shared client. It records ok or failing, and the detail `{ "source": "federation" | "api_key" }`.
- The panel shows "Claude API (federation)" or "Claude API (API key)", and the Agent service row shows the agent's credential source. A failing exchange shows the SDK's error class and status code only, never a token.

### 4.8 Docs
`docs/deploy.md`: the Console setup (§4.2), the four IDs in `atlas.env`, the helper and timer, the cut-over and a check (`systemctl status atlas-identity-token.timer`, the Status panel showing federation for both services), and "after 1.3 is settled: revoke the old key in the Console and delete `anthropic-api-key` from Secret Manager; a rollback to 1.2 needs a new key". Also `docs/google-cloud-setup.md` (service account note), `docs/configuration.md` (variables and the never-blank rule) and `docs/architecture.md` (Claude credentials paragraph).

### 4.9 Cut-over (Naresh, at release)
1. Console setup (§4.2).
2. IDs into `/etc/atlas/atlas.env`.
3. `deploy.sh 1.3.0` installs the helper and timer, then starts the stack.
4. Status shows federation for both services.
5. A Mnemosyne summary, a Melete syllabus draft and a Metis import all succeed.
6. Later: revoke the key and delete the secret.

## 5. Metis (proposed)

### 5.1 Module
- `ModuleId` gains `metis`. The admin switches it on per user. The drawer shows it after Melete.
- Routes under `/api/metis/*` behind the module guard (`MODULE_ROUTES`). Web pages under `features/metis`, at `/metis`.
- Settings › Prompts gains the Metis prompts. Settings › Models gains the two Metis model settings.

### 5.2 Storage (migration 21, sketch)
All money is integer cents (`INTEGER`); all rows carry `user_id` with `ON DELETE CASCADE`.
- `metis_accounts`: `id`, `user_id`, `name`, `kind` (`bank` | `card`), `institution` (`dbs`), `currency` (`SGD`), `position`, timestamps.
- `metis_imports`: `id`, `user_id`, `account_id`, `format` (`csv` | `pdf`), `file_name`, `status` (`processing` | `review` | `blocked` | `failed` | `posted` | `discarded`), `period_start`, `period_end`, `statement_total_cents`, `opening_balance_cents`, `closing_balance_cents`, `extracted_total_cents`, `raw` (JSON: extraction output or extra CSV columns), `model`, token usage and cost, `error`, timestamps.
- `metis_import_lines`: `id`, `import_id`, `position`, `day`, `description`, `amount_cents` (negative = out), `balance_cents`, `original_amount`, `original_currency`, `category_id`, `category_source` (`rule` | `claude` | `hand`), `rule_id`, `duplicate_of` (transaction id), `transfer_candidate` (transaction or line id), `excluded`.
- `metis_transactions` (posted): `id`, `user_id`, `account_id`, `import_id`, `day`, `description`, `amount_cents`, `category_id`, `transfer_id`, `fingerprint`, `UNIQUE ( account_id, fingerprint )`.
- `metis_categories`: `id`, `user_id`, `name`, `kind` (`spending` | `income`), `position`; seeded per user when Metis is first opened (not in the migration).
- `metis_rules`: `id`, `user_id`, `phrase` (case-insensitive contains, like calendar rules), `category_id`, `position`.
- `metis_transfers`: `id`, `user_id`, `out_transaction_id`, `in_transaction_id`.
- `metis_balances`: `account_id`, `day`, `balance_cents`, `source` (`statement` | `manual`); the net worth series.

### 5.3 Upload
`POST /api/metis/accounts/:id/imports` takes the raw file body (`express.raw` for `text/csv` and `application/pdf`, 10 MB limit, file name in a header). No new upload dependency. The file isn't written to disk or the vault. Whether the PDF is kept after posting is PRD §9.4.

### 5.4 DBS CSV
A parser in `metis/dbsCsv.ts`, built from Naresh's redacted fixture: skip the export's preamble, map the columns, parse dates and amounts to cents exactly, refuse an unknown header naming the columns found. A small in-repo parser if the export has no quoted commas; otherwise stop and ask about `csv-parse`.

### 5.5 Card statement extraction (Express, ADR 0103)
- `extractCardStatement` in `claude.client.ts`: the PDF as a base64 document block. Structured output (Zod) returns: period, previous balance, payments and credits, new transactions total, new balance, and lines (day, description, amount, original amount and currency).
- Locked instructions plus editable guidance, model setting `metis_extraction_model` (Sonnet by default). The PDF is untrusted content: the instructions treat its text as data, as `wrapSourceContent` does for summaries (1.1.1).
- **Reconciliation** (pure, `metis/reconcile.ts`): the sum of extracted lines equals the statement's transactions total, and opening balance + lines = closing balance. The exact formula is fixed against the fixture's layout. Any difference sets `blocked` with the difference. Editing lines re-runs the check.
- Usage and cost recorded per import and counted in per-user usage as "statement extraction".

### 5.6 Categorisation
- Rules first (pure `metis/rules.ts`, first match by position).
- Every line no rule matched goes into one `suggestCategories` call per import: descriptions and the user's category list in, a category per line out. Model setting `metis_categorise_model` (Haiku by default, PRD §9.5). Lines are marked `claude` until confirmed.
- A hand correction with "always" saves a rule and reapplies rules to unconfirmed lines in open imports.

### 5.7 Duplicates and transfers
- Fingerprint: account, day, amount, normalised description, occurrence index within the day. A line whose fingerprint exists is flagged `duplicate_of` and excluded by default.
- A transfer candidate: an outflow on one account and an inflow of the same amount on another of the user's accounts within 5 days, posted or in an open import. Accepting writes `metis_transfers` at posting. Transfer transactions are excluded from spending and income totals.

### 5.8 Read endpoints and screens
Overview, ledger (paged, filtered), spending (by category per month, 12-month trend), net worth (from `metis_balances`), accounts with coverage. Screens follow current MUI patterns (the uplift is a separate release). Phone layouts for the overview and review.

### 5.9 Themis
Depends on PRD §9.3. Proposed: a new goal outcome type `metis` with one metric (e.g. monthly savings rate, net worth vs target), read through a Metis function, not a stored copy.

## 6. To-dos (proposed)
- Migration 22: `todos` (`id`, `user_id`, `title`, `due_day`, `done_at`, `position`, timestamps).
- Placement depends on PRD §9.6. Proposed: inside Themis (`/themis/todos`, routes under the Themis guard), not a module of its own.
- Home: a **Due today** card reading to-dos (due today or overdue, not done) and Melete's due-review count, from their modules (no `/api/home`, ADR 0109), using `study_today` for "today".

## 7. Decisions to settle before checkpoints C–E
1. Manual accounts and net worth scope (PRD §9.1–9.2) → `metis_balances.source = manual` and an accounts form, or not.
2. Themis signal (PRD §9.3) → §5.9.
3. PDF retention and privacy (PRD §9.4) → §5.3.
4. Categorisation model and batching (PRD §9.5) → §5.6.
5. To-dos placement, recurrence, goal links (PRD §9.6) → §6.
6. Reconciliation formula and CSV columns, once the fixtures are in → §5.4, §5.5.
7. Metis ADR (0111) and to-dos ADR (0112), written when 1–6 are settled.

## 8. Tests
- No test reaches the network, the metadata server, Claude or Google. The SDK credential path is tested through constructor spies and the config loaders, not a real exchange.
- Redacted DBS fixtures (one CSV, one or two card PDFs including a refund and a foreign-currency charge) under `apps/server/src/metis/fixtures/`. For extraction, tests use a recorded structured output, not the PDF.
- e2e gains a Metis CSV import path against local fakes (the Anthropic fake answers `extractCardStatement` and `suggestCategories`), and the Log time spec runs in local time.

## 9. Release
`fixtures/schema-22.sql`; lock migrations 20–22; release notes; Naresh deploys the release branch, does the cut-over (§4.9), checks, merges and tags.
