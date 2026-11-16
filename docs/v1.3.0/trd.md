# Atlas v1.3.0 — Technical Requirements

Built from `prd.md` in this folder. Sections 2–4 (kick-off, hygiene, WIF) were decided on 2026-11-12 (ADR 0110); sections 5–6 (Metis, to-dos) on 2026-11-16 (ADRs 0111, 0112). Two details wait for Naresh's DBS fixtures: the CSV columns (§5.4) and the reconciliation formula (§5.5).

## 1. Changes at a glance
| Area | Change | ADR | State |
| --- | --- | --- | --- |
| Hygiene | `study_today` on `Me`; Log time dialog uses it | — | Decided |
| Hygiene | `vitest.integration.config.ts` placeholders; local `.env` list in `configuration.md` | — | Decided |
| Dependency | `@anthropic-ai/sdk` 1.6 → 1.7 (minor, no ADR) | — | Decided |
| Dependency | Major bump: `jsdom` 30 → 31 | — | Decided |
| Tests | Flaky `linkJob.test.ts`, `promptProfiles.routes.test.ts`: cause or "not reproduced" | — | Decided |
| Claude auth | WIF on the VM for Express and the agent; API key on the Mac; identity-token helper; Claude status row; migration 20 | 0110 | Decided |
| Metis | Imported and manual accounts, imports (CSV, PDF + reconciliation), review, categories and rules, transfers, ledger, dashboards, net worth, Themis signal; migration 21 | 0111 | Decided (CSV columns and reconciliation formula from fixtures) |
| To-dos | To-dos in Themis and Home's Due today card; migration 22 | 0112 | Decided |

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

### 2.5 Major bump: `jsdom` 31
`apps/web` devDependency `jsdom` ^30 → ^31. Test-only. Read its changelog; fix test-environment breaks without changing component code. ADR 0107 already deferred it to a later release.

### 2.6 Flaky tests
Run `pnpm gate` three times. If neither test fails, log "not reproduced in 3 runs" and close. If one fails, find the cause (shared state between files, a slow `beforeEach`, a real timer wait) and fix it. Raising `testTimeout` is not a fix. 1.2's log saw `promptProfiles.routes.test.ts` take about 7 s alone, so look at its setup first.

## 3. Migrations
Rules as in the root `CLAUDE.md` and ADRs 0084, 0085, 0099.

- **20 — Claude health kind** (seed `schema-19.sql`): rebuild `health_status` and `health_errors` as migration 13 did, the app-kind `CHECK` becoming `kind IN ( 'agent', 'transcription', 'replication', 'claude' )`. Every row survives. No count change.
- **21 — Metis** (seed `schema-20.sql`): §5.2.
- **22 — To-dos** (seed `schema-21.sql`): §6.

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

## 5. Metis (ADR 0111)

### 5.1 Module
- `ModuleId` gains `metis`. The admin switches it on per user. The drawer shows it after Melete.
- Routes under `/api/metis/*` behind the module guard (`MODULE_ROUTES`). Web pages under `features/metis`, at `/metis`.
- Settings › Prompts gains the Metis prompts. Settings › Models gains the two Metis model settings.

### 5.2 Storage (migration 21)
All money is integer cents (`INTEGER`); all rows carry `user_id` with `ON DELETE CASCADE`.
- `metis_accounts`: `id`, `user_id`, `name`, `kind` (`bank` | `card` | `asset` | `liability`), `institution` (`dbs` for `bank` and `card`, `NULL` for the manual kinds; a `CHECK` ties them), `currency` (`SGD`), `position`, timestamps. `asset` and `liability` are manual accounts: balance snapshots only, never imports or transactions.
- `metis_imports`: `id`, `user_id`, `account_id` (an imported kind only), `format` (`csv` | `pdf`), `file_name`, `file_path` (nullable; §5.3), `status` (`processing` | `review` | `blocked` | `failed` | `posted` | `discarded`), `period_start`, `period_end`, `statement_total_cents`, `opening_balance_cents`, `closing_balance_cents`, `extracted_total_cents`, `raw` (JSON: extraction output or extra CSV columns), `model`, token usage and cost, `error`, timestamps.
- `metis_import_lines`: `id`, `import_id`, `position`, `day`, `description`, `amount_cents` (negative = out), `balance_cents`, `original_amount`, `original_currency`, `category_id`, `category_source` (`rule` | `claude` | `hand`), `rule_id`, `duplicate_of` (transaction id), `transfer_candidate` (transaction or line id), `excluded`.
- `metis_transactions` (posted): `id`, `user_id`, `account_id`, `import_id`, `day`, `description`, `amount_cents`, `category_id`, `transfer_id`, `fingerprint`, `UNIQUE ( account_id, fingerprint )`.
- `metis_categories`: `id`, `user_id`, `name`, `kind` (`spending` | `income` | `transfer`), `position`, `UNIQUE ( user_id, name )`. Flat: no parent. Seeded per user when Metis is first opened (not in the migration): Food, Groceries, Taxi, Public transport, Shopping, Bills & utilities, Subscriptions, Health, Entertainment, Travel (spending), Income (income), Transfers (transfer). A line with no category is "Uncategorised" (`category_id` `NULL`), not a seeded row.
- `metis_rules`: `id`, `user_id`, `phrase` (case-insensitive contains, stored trimmed and upper-cased), `category_id`, timestamps, `UNIQUE ( user_id, phrase )`. No position: the longest matching phrase wins (§5.6).
- `metis_transfers`: `id`, `user_id`, `out_transaction_id`, `in_transaction_id`.
- `metis_balances`: `account_id`, `day`, `balance_cents`, `source` (`statement` | `manual`), `PRIMARY KEY ( account_id, day )`; the net worth series. Imported accounts get `statement` rows from posted imports (closing balance, or the CSV's last running balance). Manual accounts get `manual` rows from the snapshot form. A liability's balance is stored positive and subtracted in net worth.

### 5.3 Upload
`POST /api/metis/accounts/:id/imports` takes the raw file body (`express.raw` for `text/csv` and `application/pdf`, 10 MB limit, file name in a header). No new upload dependency.
- **Retention:** the file is written to `/data/metis-uploads/<import id>` (the data volume, outside the SQLite file, so Litestream never copies it; mode 0600) and `file_path` is set. It is deleted, and `file_path` cleared, in the same request that posts or discards the import. It exists only while the import is `processing`, `review`, `blocked` or `failed`, so a retry needs no re-upload.
- A sweep at startup deletes any upload file whose import is posted, discarded or missing.
- Never written to the vault, never logged.

### 5.4 DBS CSV
A parser in `metis/dbsCsv.ts`, built from Naresh's redacted fixture: skip the export's preamble, map the columns, parse dates and amounts to cents exactly, refuse an unknown header naming the columns found. A small in-repo parser if the export has no quoted commas; otherwise stop and ask about `csv-parse`.

### 5.5 Card statement extraction (Express, ADR 0103)
- `extractCardStatement` in `claude.client.ts`: the PDF as a base64 document block. Structured output (Zod) returns: period, previous balance, payments and credits, new transactions total, new balance, and lines (day, description, amount, original amount and currency).
- Locked instructions plus editable guidance, model setting `metis_extraction_model` (Sonnet by default). The PDF is untrusted content: the instructions treat its text as data, as `wrapSourceContent` does for summaries (1.1.1).
- **Reconciliation** (pure, `metis/reconcile.ts`): the sum of extracted lines equals the statement's transactions total, and opening balance + lines = closing balance. The exact formula is fixed against the fixture's layout. Any difference sets `blocked` with the difference. Editing lines re-runs the check.
- Usage and cost recorded per import and counted in per-user usage as "statement extraction".

### 5.6 Categorisation
- Rules first (pure `metis/rules.ts`): every rule whose phrase the upper-cased description contains matches; the **longest phrase wins**, ties broken by the oldest rule. A phrase is plain text, never a pattern.
- Every line no rule matched goes into **one** `suggestCategories` call per import. Lines are grouped by their normalised full description (trimmed, upper-cased, card and reference numbers stripped), never by brand, so "GRAB*RIDE" and "GRABFOOD" are separate entries. In: the distinct descriptions and the user's category names. Out: one category name or `Uncategorised` per description, never a new name (anything else is treated as `Uncategorised`). Model setting `metis_categorise_model`, Haiku by default; locked instructions plus editable guidance. The instructions may name common Singapore merchants as examples, as guidance, not rules. Lines are marked `claude` until confirmed.
- A hand correction with "always" saves a rule and reapplies rules to unconfirmed lines in open imports.

### 5.7 Duplicates and transfers
- Fingerprint: account, day, amount, normalised description, occurrence index within the day. A line whose fingerprint exists is flagged `duplicate_of` and excluded by default.
- A transfer candidate: an outflow on one account and an inflow of the same amount on another of the user's accounts within 5 days, posted or in an open import. Accepting writes `metis_transfers` at posting. Transfer transactions are excluded from spending and income totals.

### 5.8 Read endpoints and screens
Overview, ledger (paged, filtered), spending (by category per month, 12-month trend), net worth (from `metis_balances`), accounts with coverage. Screens follow current MUI patterns (the uplift is a separate release). Phone layouts for the overview and review.

### 5.9 Themis
- A new Themis goal outcome type `metis`, alongside the 1.1 types, with `metis_metric` `savings_rate` (target: a percentage) or `net_worth` (target: an amount in cents). The goal form offers it only to users with Metis.
- **Savings rate** for a month = ( income − spending ) / income over posted transactions in that month, transfers excluded; no value for a month with no income. Progress shows the last full month and a 6-month trend against the target.
- **Net worth** = §5.8's figure on the latest day; progress is current against target.
- Read through a Metis function (`metis/signals.ts`) at request time, never copied into Themis tables. A goal's metric survives Metis being switched off (it shows "Metis is off").
- Stored on the goal (migration 21 adds `metis_metric` and the target column to `themis_goals`, or the 1.1 outcome table if that is where targets live: follow the existing shape).

## 6. To-dos (ADR 0112)
- Migration 22: `themis_todos` (`id`, `user_id`, `title`, `due_day` nullable, `goal_id` nullable `REFERENCES themis_goals ( id ) ON DELETE SET NULL`, `done_at` nullable, `position`, timestamps).
- Inside Themis: routes under `/api/themis/todos` behind the Themis guard; page at `/themis/todos`, linked from the Themis home; a goal's page lists its open to-dos.
- One-off only: no recurrence. Completing sets `done_at`; completed to-dos stay listed under "Done" and can be reopened. To-dos never count toward goal progress.
- Home: a **Due today** card reading to-dos (due today or overdue, not done) and Melete's due-review count, from their modules (no `/api/home`, ADR 0109), using `study_today` for "today".

## 7. Decisions
Settled 2026-11-16 (PRD §9): manual accounts as snapshots (§5.2), net worth (§5.8), Themis signal (§5.9), file retention (§5.3), categorisation (§5.6), to-dos (§6), `jsdom` 31 (§2.5). ADR 0111 (Metis) and ADR 0112 (to-dos) record them.

Still open, settled from the fixtures in checkpoint C without a new ADR unless they contradict this TRD:
1. The DBS CSV columns, preamble and date format (§5.4).
2. The reconciliation formula for the card statement layout (§5.5).

## 8. Tests
- No test reaches the network, the metadata server, Claude or Google. The SDK credential path is tested through constructor spies and the config loaders, not a real exchange.
- Redacted DBS fixtures (one CSV, one or two card PDFs including a refund and a foreign-currency charge) under `apps/server/src/metis/fixtures/`. For extraction, tests use a recorded structured output, not the PDF.
- e2e gains a Metis CSV import path against local fakes (the Anthropic fake answers `extractCardStatement` and `suggestCategories`), and the Log time spec runs in local time.

## 9. Release
`fixtures/schema-22.sql`; lock migrations 20–22; release notes; Naresh deploys the release branch, does the cut-over (§4.9), checks, merges and tags.
