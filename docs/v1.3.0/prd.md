# Atlas v1.3.0 — Product Requirements

## 1. Summary
v1.3.0 is the "Metis" release, opened by a security change and a short hygiene pass. It does three things:
- **No Claude API key on the VM.** Express and the agent service authenticate to the Claude API with Workload Identity Federation: the VM's Google service account proves who it is, and Anthropic returns short-lived tokens. The `anthropic-api-key` secret leaves Secret Manager. Local development on the Mac keeps an API key.
- **Metis, first release.** A finance module: import DBS statements (debit account as CSV, credit card as PDF), review each import before it counts, categorise transactions, match transfers between his own accounts, and see a ledger, spending dashboards and net worth.
- **To-dos.** His own tasks with due dates, shown under "due today" on Home (agreed at 1.2 as the next release).

Around these: the items deferred from 1.2 (Log time near midnight, the broken `test:integration` config, the SDK minor bump, the two flaky server tests) and one major dependency bump.

## 2. Background
Since 0.10 the Claude API key has lived in Secret Manager and been written to `/run/atlas/secrets.env` at boot. It never expires; a leak is only stopped by noticing and revoking it. Anthropic's Workload Identity Federation (WIF) lets a workload exchange an identity token from its own provider for a Claude API token that expires in minutes. Google Cloud is a supported provider, and the VM already has a user-managed service account (`atlas-vm`) whose identity tokens the metadata server issues. WIF was KIV since 0.2.

Metis was slated for 1.1 and moved behind Themis. It completes the "financial" area in Themis, which today has only manual goals. The Claude advisor layer comes in the release after (as an agent-service endpoint, ADR 0103).

Decided while scoping (2026-11-11 to 2026-11-12):
- **WIF:** on the VM only, for both Express and the agent service. The Mac keeps `ANTHROPIC_API_KEY` (dev, `test:integration`). A small host-side helper writes the VM's identity token to a file the SDKs read (`ANTHROPIC_IDENTITY_TOKEN_FILE`). WIF is the first checkpoint, so every Metis Claude call is built on it. It is app-level: the second user changes nothing (one Anthropic service account, one bill; per-user usage stays in Atlas).
- **Metis sources:** one bank, DBS. The debit account comes in as the DBS **CSV export**, parsed exactly, no Claude. The credit card comes in as the monthly **PDF statement**, extracted by Claude, then **reconciled** against the statement's own total: a mismatch blocks the import until he fixes it. Every import is **reviewed before it counts**.
- **Transfers:** a card bill payment in the debit account and the card's own payment line are matched, so spending isn't counted twice.
- **Storage:** SQLite, like every other module (not a document store). Raw, bank-specific data (the extraction output, extra CSV columns) goes in JSON columns on the import record.
- **Design:** an app-wide UX uplift is being designed separately in Claude Design. Metis screens in 1.3 follow the current MUI patterns; the uplift lands in its own release.
- The business-idea validator waits for the `@naresh/*` platform kit work. The other 1.2 KIV items (Claude suggestions for unmatched calendar drafts, time targets per goal) stay out of 1.3.

## 3. Goals
- The VM holds no long-lived Claude credential, and the Status panel says which credential each service is using.
- A month of DBS statements goes from files to a reviewed, categorised ledger in a few minutes, with no transaction counted twice and no credit-card import that doesn't add up.
- Opening Metis answers "where did my money go this month, and what am I worth?"
- Home shows what's due today.
- `pnpm gate`, `pnpm e2e` and `test:integration` are green at any hour, in any time zone.
- The VM upgrades from 1.2.0 to 1.3.0 with all data kept.

## 4. Non-goals
- **No Claude advisor** in Metis, no budgets, no alerts, no forecasting.
- **No bank connections** (open banking, scraping). Files only.
- **No other banks** in 1.3, and no other file formats for DBS.
- **No WIF on the Mac**, and no per-user Anthropic credentials.
- **No app-wide redesign** in this release.
- No change to how Mnemosyne, Melete or the calendar source work.

## 5. User flows
1. **First import.** Naresh opens Metis, adds his two DBS accounts (debit, credit card), and uploads last month's debit CSV. The review screen lists every line with a suggested category; three merchants are new, so Claude suggested those. He fixes one and ticks "always", which saves a rule. He approves; the lines join the ledger.
2. **Credit card.** He uploads the card PDF. The review screen shows "Statement total S$1,284.50 · extracted S$1,284.50 · reconciled". The card payment line is proposed as a match for the bill payment already in the debit account. He approves.
3. **A bad extraction.** Next month the totals differ by S$42.00. The import is blocked with the difference shown. He spots the missing line, adds it by hand, the totals agree, and he approves.
4. **Overview.** Metis shows this month's spending against last month, spending by category, net worth and anything needing attention.
5. **To-dos.** He adds "Renew passport, due Friday". On Friday, Home's "due today" lists it with today's Melete reviews; he ticks it off there.

## 6. Features

### 6.1 Kick-off and hygiene (deferred from 1.2)
- [ ] **Log time near midnight:** the server sends its own study day (`study_today`) and the Log time dialog uses it as its default and maximum day. The server's check is unchanged. `themis.spec.ts` passes without `TZ=UTC`.
- [ ] **`test:integration` works again:** its config supplies placeholders for the non-Claude required variables, so a run needs only `ANTHROPIC_API_KEY`. `docs/configuration.md` lists what a current local `.env` needs.
- [ ] **`@anthropic-ai/sdk` 1.6 → 1.7** (or the newest 1.x past pnpm's `minimumReleaseAge`; never a waiver).
- [ ] **Flaky tests:** `linkJob.test.ts` and `promptProfiles.routes.test.ts` are either fixed at their cause or recorded as not reproduced. Raising a timeout is not a fix.
- [ ] **One major dependency bump** (which: TRD).

### 6.2 Workload Identity Federation
- [ ] On the VM, Express and the agent service authenticate to the Claude API with WIF. Neither has `ANTHROPIC_API_KEY` in its environment.
- [ ] The VM keeps a fresh Google identity token for its service account in a file both containers read. The stack doesn't start without one.
- [ ] Each service refuses to start if both an API key and federation are configured, or neither, naming the variables.
- [ ] The Mac, `pnpm dev`, `docker compose up` and `test:integration` keep working with an API key.
- [ ] The Status panel has a **Claude API** row showing the credential source (federation or API key) and whether a cheap call succeeds.
- [ ] `fetch-secrets.sh` stops reading `anthropic-api-key`.
- [ ] `docs/deploy.md` and `docs/google-cloud-setup.md` cover the Console setup (issuer, service account, rule), the VM variables and the cut-over. Revoking the old key and deleting the secret is Naresh's, after 1.3 is settled (a rollback to 1.2 needs a key).

### 6.3 Metis: accounts and imports
- [ ] Metis is a module the admin can switch on per user, with its own data per user.
- [ ] A user adds accounts: name, kind (bank account or credit card), institution (DBS).
- [ ] **Debit CSV:** uploading a DBS export parses every transaction exactly (date, description, amount, balance where given).
- [ ] **Credit card PDF:** uploading a statement sends it to Claude, which returns the transactions and the statement's totals. Extracted lines must add up to the statement total, or the import is **blocked** with the difference shown.
- [ ] **Review before posting:** every import opens a review where lines can be edited, added, removed or recategorised, then approved (posted to the ledger) or discarded. Nothing counts until approved.
- [ ] **Duplicates:** a line already in the ledger (overlapping statements, a re-upload) is flagged and skipped by default.
- [ ] Amounts are exact (integer cents, SGD). A foreign-currency card charge keeps its original amount and currency as a note; the SGD amount is what counts.

### 6.4 Metis: categories and rules
- [ ] Categories are the user's own list, seeded with a sensible default set.
- [ ] **Rules first:** a rule maps a description pattern to a category. Lines that match no rule get a Claude suggestion, shown as a suggestion until confirmed.
- [ ] Correcting a category offers "always": it saves a rule and reapplies it to unreviewed lines.

### 6.5 Metis: transfers
- [ ] A transfer between two of the user's accounts (the card bill payment) is proposed as a match during review and, once accepted, counts as neither spending nor income.
- [ ] An unmatched suspected transfer is listed under "needs attention".

### 6.6 Metis: ledger, dashboards, net worth
- [ ] **Ledger:** every posted transaction across accounts, searchable and filterable (account, category, date, amount), with inline recategorise and "make a rule".
- [ ] **Overview:** this month's spending against last month, by category, the net worth figure, items needing attention, last import per account.
- [ ] **Spending:** by category per month and a trend over up to 12 months, drilling down to transactions.
- [ ] **Net worth:** the sum of account balances over time, by account.
- [ ] **Accounts** show statement coverage, which months are imported, with gaps highlighted.

### 6.7 Metis and Themis
- [ ] A Themis goal can take a financial outcome signal from Metis (which: open question 3).

### 6.8 To-dos
- [ ] A user can add, edit, complete and delete to-dos with an optional due date.
- [ ] Home gains a **Due today** card: to-dos due today or overdue, plus today's Melete reviews due.

## 7. Constraints
- **Data first (ADRs 0084, 0085):** every schema change is a new locked migration with a seed fixture and an upgrade test. Nothing resets the VM's database.
- **Placement (ADR 0103):** statement extraction and category suggestions are single bounded calls, so they run in Express with the locked-instructions plus editable-guidance plus per-call model pattern.
- **Privacy:** statement files are personal content. They're never logged (ADR 0049) and never written to the vault. Merchant names, amounts and descriptions never appear in logs.
- **Dependencies:** only those named in the TRD.
- **Tests:** no test touches the network, Claude, Google or the metadata server. Statement fixtures are redacted samples Naresh supplies.
- **Release branch:** work happens on `release/1.3.0`; Naresh merges and tags.

## 8. Out of scope (KIV)
- The Metis advisor (agent-service endpoint, next release), budgets, alerts, forecasts.
- Other banks and file formats; manual accounts beyond what open question 1 settles.
- Claude suggestions for unmatched calendar drafts; time targets per goal.
- The business-idea validator (after the platform kit).
- The app-wide UX uplift (its own release, from the Claude Design work).
- `ts-fsrs` 6 and TypeScript 7 (a release each).

## 9. Open questions
To settle before the Metis checkpoints are planned (WIF and the kick-off don't depend on them):
1. **Manual accounts:** in 1.3 or not (cash, investments, CPF, property, loans as hand-entered balance snapshots)?
2. **Net worth:** bank and card balances only, or with manual accounts?
3. **Themis signal:** which outcome Metis feeds a goal (savings rate, net worth against a target, spending in a category under a cap)?
4. **Privacy of extraction:** confirm the full card statement goes to Claude. Is the uploaded PDF kept after the import is approved, or deleted?
5. **Category suggestions:** model and batching (every unknown merchant in one call per import).
6. **To-dos:** recurring to-dos, links to goals, and whether they live in Themis or their own module.
7. **Major bump:** `jsdom` 31 (proposed; `ts-fsrs` 6 and TypeScript 7 each get their own release, ADR 0107).
