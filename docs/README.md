# Docs

## Plans

Each version has its own folder. The current version is 0.11.0. User guides: [deploy.md](deploy.md) (hosting on a VM), [backups.md](backups.md), [phone-access.md](phone-access.md), [google-cloud-setup.md](google-cloud-setup.md).

- **v0.11.0 (released, soaking):** [PRD](v0.11.0/prd.md) · [TRD](v0.11.0/trd.md) · [Tasks](v0.11.0/tasks.md) · [Release notes](v0.11.0/release-notes.md) · checkpoint plans in `v0.11.0/plans/` · [1.0 readiness](v1-readiness.md)
- **v0.10.0 (done):** [PRD](v0.10.0/prd.md) · [TRD](v0.10.0/trd.md) · [Tasks](v0.10.0/tasks.md) · [Release notes](v0.10.0/release-notes.md) · checkpoint plans in `v0.10.0/plans/` · [Deploy runbook](deploy.md)
- **v0.9.1 (done):** [PRD](v0.9.1/prd.md) · [TRD](v0.9.1/trd.md) · [Tasks](v0.9.1/tasks.md) · [Release notes](v0.9.1/release-notes.md) · checkpoint plans in `v0.9.1/plans/`
- **v0.9.0 (done):** [PRD](v0.9.0/prd.md) · [TRD](v0.9.0/trd.md) · [Tasks](v0.9.0/tasks.md) · [Release notes](v0.9.0/release-notes.md) · checkpoint plans in `v0.9.0/plans/`
- **v0.8.0 (done):** [PRD](v0.8.0/prd.md) · [TRD](v0.8.0/trd.md) · [Tasks](v0.8.0/tasks.md) · [Release notes](v0.8.0/release-notes.md) · checkpoint plans in `v0.8.0/plans/`
- **v0.7.1 (done):** [PRD](v0.7.1/prd.md) · [TRD](v0.7.1/trd.md) · [Tasks](v0.7.1/tasks.md) · [Release notes](v0.7.1/release-notes.md) · checkpoint plans in `v0.7.1/plans/`
- **v0.7.0 (done):** [PRD](v0.7.0/prd.md) · [TRD](v0.7.0/trd.md) · [Tasks](v0.7.0/tasks.md) · [Release notes](v0.7.0/release-notes.md) · checkpoint plans in `v0.7.0/plans/`
- **v0.6.0 (done):** [PRD](v0.6.0/prd.md) · [TRD](v0.6.0/trd.md) · [Tasks](v0.6.0/tasks.md) · [Release notes](v0.6.0/release-notes.md) · checkpoint plans in `v0.6.0/plans/`
- **v0.5.0 (done):** [PRD](v0.5.0/prd.md) · [TRD](v0.5.0/trd.md) · [Tasks](v0.5.0/tasks.md) · [Release notes](v0.5.0/release-notes.md) · checkpoint plans in `v0.5.0/plans/`
- **v0.4.0 (done):** [PRD](v0.4.0/prd.md) · [TRD](v0.4.0/trd.md) · [Tasks](v0.4.0/tasks.md) · [Release notes](v0.4.0/release-notes.md) · checkpoint plans in `v0.4.0/plans/`
- **v0.3.1 (done):** [PRD](v0.3.1/prd.md) · [TRD](v0.3.1/trd.md) · [Tasks](v0.3.1/tasks.md) · checkpoint plans in `v0.3.1/plans/`
- **v0.3.0 (done):** [PRD](v0.3.0/prd.md) · [TRD](v0.3.0/trd.md) · [Tasks](v0.3.0/tasks.md) · [Release notes](v0.3.0/release-notes.md) · checkpoint plans in `v0.3.0/plans/`
- **v0.2.0 (done):** [PRD](v0.2.0/prd.md) · [TRD](v0.2.0/trd.md) · [Tasks](v0.2.0/tasks.md) · checkpoint plans in `v0.2.0/plans/`
- **v0.1.0 (done):** [Server](v0.1.0/implementation-server.md) · [Web](v0.1.0/implementation-web.md)

## Architecture decisions

Each significant decision is recorded as a short ADR (Architecture Decision Record) in `decisions/`. ADRs are append-only: to change a decision, add a new ADR that supersedes the old one and update the old one's status.

| # | Decision | Status |
|---|----------|--------|
| [0001](decisions/0001-monorepo-pnpm-workspaces.md) | Monorepo with pnpm workspaces | Accepted |
| [0002](decisions/0002-local-whisper-transcription.md) | Local transcription with whisper.cpp | Superseded by 0074 |
| [0003](decisions/0003-audio-acquisition-yt-dlp-ffmpeg.md) | Audio acquisition with yt-dlp and ffmpeg | Accepted |
| [0004](decisions/0004-runtime-docker-plus-native-whisper.md) | App in Docker, Whisper native on the host | Superseded by 0074 |
| [0005](decisions/0005-markdown-first-output.md) | Markdown-first output, Obsidian-ready | Accepted |
| [0006](decisions/0006-async-job-model.md) | Asynchronous job model | Partly superseded by 0012, 0015 |
| [0007](decisions/0007-tdd-vitest-supertest.md) | TDD with Vitest and Supertest | Accepted |
| [0008](decisions/0008-zod-for-validation-and-contracts.md) | Zod for validation and contracts | Accepted |
| [0009](decisions/0009-code-style-and-eslint.md) | Code style enforced by ESLint, check-only | Accepted |
| [0010](decisions/0010-typescript-6-for-eslint.md) | TypeScript 6 until typescript-eslint supports TypeScript 7 | Accepted |
| [0011](decisions/0011-web-stack.md) | Web app: Vite, React, plain CSS, hand-written polling | Partly superseded by 0013, 0024 |
| [0012](decisions/0012-sqlite-job-store.md) | SQLite job store with better-sqlite3 | Accepted (amended by 0066) |
| [0013](decisions/0013-tanstack-query-react-router.md) | TanStack Query and React Router | Accepted |
| [0014](decisions/0014-claude-summarizer.md) | Summaries with the Claude API, called from the server | Accepted (amended by 0027, 0028, 0030) |
| [0015](decisions/0015-transcript-lifecycle.md) | Transcript lifecycle: reviewed, then deleted | Accepted (amended by 0030) |
| [0016](decisions/0016-local-drafts.md) | Review edits drafted in localStorage | Superseded by 0020 |
| [0017](decisions/0017-commit-docs-and-claude-md.md) | Commit docs/ and the CLAUDE.md files | Accepted |
| [0018](decisions/0018-spec-driven-workflow.md) | Spec-driven workflow with checkpoints | Accepted |
| [0019](decisions/0019-mdxeditor-note-editor.md) | MDXEditor for the note editor | Accepted |
| [0020](decisions/0020-server-side-drafts.md) | Server-side drafts | Accepted |
| [0021](decisions/0021-note-as-one-markdown-string.md) | The draft is the whole note as one Markdown string | Accepted |
| [0022](decisions/0022-vault-wide-folder-picker.md) | Vault-wide folder picker, writes confined to the vault | Accepted |
| [0023](decisions/0023-mdxeditor-round-trip-contract.md) | MDXEditor round-trip contract | Accepted (amended by 0026) |
| [0024](decisions/0024-material-ui-single-ui-library.md) | Material UI as the single UI library | Accepted |
| [0025](decisions/0025-app-shell-drawer-and-colour-mode.md) | App shell: navigation drawer and colour mode | Accepted |
| [0026](decisions/0026-bold-around-a-link-is-normalised.md) | Bold around a link is normalised to link around bold | Accepted |
| [0027](decisions/0027-editable-summarizer-prompts.md) | Editable summarizer prompts: profiles of versioned guidance on a locked contract | Accepted |
| [0028](decisions/0028-summary-model-from-models-api.md) | Summary model chosen in the app, listed from the Models API | Accepted |
| [0029](decisions/0029-summary-runs-and-regeneration.md) | Summary runs: provenance and cost in the database, and regenerating a summary | Accepted |
| [0030](decisions/0030-source-adapters-and-intakes.md) | Source adapters and intakes: one `SourceDocument` for every source | Accepted |
| [0031](decisions/0031-article-extraction.md) | Article extraction: Readability on linkedom, turndown to Markdown, fetch limits | Accepted |
| [0032](decisions/0032-rss-feeds-inbox-poller.md) | RSS feeds with feedsmith, an inbox before summarizing, and a separate poller | Accepted (amended by 0038) |
| [0033](decisions/0033-browser-mode-tests.md) | Browser-mode tests with Vitest and Playwright for real-DOM behaviour | Accepted |
| [0034](decisions/0034-caret-sync-paragraph-and-front-matter.md) | Caret sync: match paragraphs by whole second, and ignore the front-matter | Superseded by 0074 |
| [0035](decisions/0035-gmail-intake.md) | Gmail intake: `@googleapis/gmail`, server-side OAuth, an encrypted refresh token, and a date-window sync | Accepted (amended by 0061) |
| [0036](decisions/0036-newsletters-email-to-markdown.md) | Newsletters: email to Markdown with Readability first and unwrapped layout tables as fallback | Accepted (amended by 0040) |
| [0037](decisions/0037-job-postings-dataset.md) | Job postings: Claude extraction into fixed columns plus JSON, deduplicated by platform job ID | Accepted (deferred by 0041) |
| [0038](decisions/0038-unified-inbox.md) | One inbox for feed items and newsletter emails | Accepted |
| [0039](decisions/0039-feed-item-schemas-server-local.md) | Feed-item schemas stay server-local until the unified inbox routes land | Superseded (by the 0038 routes, tasks 8.4–8.5) |
| [0040](decisions/0040-newsletters-whole-body.md) | Newsletters: convert the whole cleaned body, not Readability's best block | Accepted |
| [0041](decisions/0041-defer-job-alert-intake.md) | Defer job-alert intake and the Freelance jobs page to a later version | Accepted |
| [0042](decisions/0042-vault-agent-service.md) | A stateless Python vault agent service, with the vault mounted read-only | Accepted |
| [0043](decisions/0043-agent-contract.md) | Agent contract: Pydantic is the source, Zod mirrors it, shared examples catch drift | Accepted |
| [0044](decisions/0044-wikilinks-concepts-and-agent-loop.md) | Wikilinks: links only from the new note, concept links, text-tool search and computed kinds | Accepted |
| [0045](decisions/0045-per-link-review.md) | Per-link review: shared insertion functions and one transaction per accept | Accepted |
| [0046](decisions/0046-linker-prompt-and-settings.md) | Linker prompt as a prompt profile with a purpose; locked instructions owned by the agent service | Accepted |
| [0047](decisions/0047-async-settings-and-linking-model-default.md) | Settings resolve the linking model asynchronously; hot paths read narrow accessors | Accepted |
| [0048](decisions/0048-job-lifecycle-table.md) | One job lifecycle: a pure table of states and moves, enforced by `moveTo` | Accepted |
| [0049](decisions/0049-structured-logging.md) | Structured logs: pino in the server, a JSON formatter in the agent, the job ID across both | Accepted |
| [0050](decisions/0050-health-status.md) | Health status: one table per subject, one `recordCheck`, and a Status panel | Accepted |
| [0051](decisions/0051-manual-database-backups.md) | Manual database backups with SQLite's online backup, to a host folder | Superseded by 0076 |
| [0052](decisions/0052-data-router-and-settings-routes.md) | A data router, Settings as routed tabs, and one unsaved-changes guard | Accepted |
| [0053](decisions/0053-e2e-smoke-test.md) | End-to-end smoke test: the real Compose stack against local fakes, driven by Playwright | Accepted |
| [0054](decisions/0054-modules-share-the-vault-own-their-data.md) | Modules share the vault read-only and own their data | Accepted (amended by 0072) |
| [0055](decisions/0055-melete-in-express.md) | Melete's Claude calls run in Express, not the agent service | Accepted |
| [0056](decisions/0056-fsrs-scheduling.md) | FSRS scheduling with ts-fsrs | Accepted |
| [0057](decisions/0057-note-identity-and-scans.md) | Note identity: path plus body hash, on-demand scans | Accepted |
| [0058](decisions/0058-melete-data-and-generator-loop.md) | Melete's data model and generator loop | Accepted |
| [0059](decisions/0059-study-profile-and-folder-memory.md) | Study profile and per-profile folder memory | Accepted |
| [0060](decisions/0060-phone-access.md) | Phone access: localhost-only port, Tailscale Serve, installable web app | Accepted (amended by 0061, 0077) |
| [0061](decisions/0061-google-sign-in-and-sessions.md) | Google sign-in and server-side sessions | Accepted (amended by 0071) |
| [0062](decisions/0062-per-user-ownership-and-isolation.md) | Every row has an owner; isolation in the repositories | Accepted |
| [0063](decisions/0063-per-user-vaults-and-onboarding.md) | Per-user vaults under one root, chosen at first sign-in | Accepted (amended by 0070, 0075) |
| [0064](decisions/0064-shared-background-loops.md) | One background loop of each kind, round-robin by user | Accepted |
| [0065](decisions/0065-user-and-app-settings.md) | Per-user settings, app settings, per-user seeding, split health | Accepted |
| [0066](decisions/0066-fresh-baseline-schema.md) | A fresh baseline schema; old databases set aside | Accepted |
| [0067](decisions/0067-admin-and-usage.md) | Admin routes and a usage rollup | Accepted (amended by 0069) |
| [0068](decisions/0068-web-gate-and-module-guards.md) | Web: one gate, module guards, filtered navigation | Accepted |
| [0069](decisions/0069-job-keeps-video-duration.md) | A job keeps its video's duration | Accepted (amends TRD §3.2, §8.2) |
| [0070](decisions/0070-choose-a-new-vault-when-missing.md) | A user can choose a new vault when their folder is missing | Accepted (amends ADR 0063, TRD §2.1) |
| [0071](decisions/0071-trusted-proxy-peers.md) | Forwarded headers are trusted from loopback and private-network peers | Accepted (amends ADR 0061, task 3.3) |
| [0072](decisions/0072-learning-root-created-on-save.md) | The learning root is created on save in Settings | Accepted (amends ADR 0054) |
| [0073](decisions/0073-rename-to-atlas.md) | The app is Atlas; Mnemosyne is its transcriber module | Accepted |
| [0074](decisions/0074-openai-transcription-without-timestamps.md) | Transcription with OpenAI's gpt-transcribe, without timestamps | Accepted (supersedes 0002, 0004, 0034) (OpenAI part superseded by 0081) |
| [0075](decisions/0075-obsidian-headless-per-user.md) | Vaults on the VM are synced by Obsidian Headless, one container per user | Accepted (amends 0063) |
| [0076](decisions/0076-litestream-replication.md) | Continuous replication with Litestream replaces manual backups | Accepted (supersedes 0051) |
| [0077](decisions/0077-gcp-vm-hosting-and-deploys.md) | Hosting on one GCP VM: Compose files, images from the Mac, a bootstrap script | Accepted (amends 0060) |
| [0078](decisions/0078-secrets-from-secret-manager.md) | Secrets are fetched from Secret Manager into memory when the stack starts | Accepted (secret list changed by 0081) |
| [0079](decisions/0079-youtube-po-token-provider.md) | YouTube downloads on the VM use a PO token provider | Superseded by 0081 |
| [0080](decisions/0080-pot-provider-health-kind-and-schema-12.md) | The PO token provider gets its own health kind, which needs schema 12 | Superseded by 0081 |
| [0081](decisions/0081-gemini-transcribes-youtube-links.md) | Gemini transcribes YouTube links; video is YouTube-only | Accepted (supersedes 0079, 0080; 0074 in part; amended by 0083) |
| [0082](decisions/0082-gemini-request-details.md) | Gemini request details: model-get path, low thinking, what "long" means | Accepted (changes TRD §12.1, §12.10; amended by 0083) |
| [0083](decisions/0083-gemini-developer-api-with-key.md) | Gemini through the Developer API with an API key, not Vertex AI | Accepted (amends 0081, 0082) |
| [0084](decisions/0084-stability-promise-from-1-0.md) | From 1.0, the database is never reset | Accepted |
| [0085](decisions/0085-locked-migrations-and-seed-fixtures.md) | Released migrations are locked by hash and upgrade-tested from SQL seeds | Accepted |
| [0086](decisions/0086-deploy-preflight-and-rollback.md) | deploy.sh checks replication first, records each deploy, and rolls back past a migration | Accepted |
| [0087](decisions/0087-dependency-policy.md) | Minor and patch updates only before 1.0; majors one per release after; images pinned by digest | Accepted |
| [0088](decisions/0088-restore-drill-scratch-check-only.md) | The 0.11 restore drill is the scratch check; the new-VM rehearsal is deferred | Accepted |

## Template for new ADRs

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context
What problem or constraint forced a decision.

## Decision
What we chose.

## Consequences
What becomes easier, what becomes harder, what we accept.

## Alternatives considered
Options rejected and why.
```
