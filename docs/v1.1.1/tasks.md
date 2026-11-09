# Tasks — Atlas v1.1.1

A hardening and tidy-up release: no new features. Built from `trd.md` in this folder (decisions only; there is no PRD). Tasks run strictly in order. Each one is test-first and ends in its own commit.

**Branch:** `release/1.1.1`. Never commit to `main`, never merge, never tag.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done (tests green, committed, pushed) · ⏸️ Deferred
**Plan:** ⬜ Not approved · ✅ Approved (the link points to the saved plan)

## How this file works
- Work is grouped into checkpoints. **Start of a checkpoint:** in plan mode, write one plan for every task in it (files to touch, tests to write first, expected red → green path), then stop. When Naresh approves it, save the plan to the linked file, tick the Plan cell, commit, push.
- **During a checkpoint:** work through its tasks without stopping. For each task: failing tests first → green → refactor; tick Status; add a log line at the bottom; commit; push.
- **Commits** are conventional, with no scope: `feat: …`, `fix: …`, `refactor: …`, `docs: …`, `test: …`, `chore: …`. The subject names the change. The task id lives here, not in the message.
- **End of a checkpoint:** stop and report what was built with commit hashes, test/lint/typecheck per package (plus `test:browser`, the agent's tests and the `deploy/` tests), `pnpm e2e`, anything deferred, any ADR that changes the TRD. Don't start the next checkpoint until Naresh says so.
- Never start a task whose checkpoint Plan cell is ⬜.
- Not covered by the TRD or an ADR? Stop and ask. Record the decision as the next ADR (from 0096) and add its number to the task's ADR column.
- **Behaviour-neutral means behaviour-neutral.** Checkpoints C and D must not change what any endpoint returns or any page shows. Existing tests pass unchanged except where a task says a test moves or is deleted; list each moved or deleted test file in the log line.
- **Data (ADRs 0084, 0085):** any migration is written test-first against the seed of the schema it starts from, then locked. Nothing resets or hand-edits the VM's database.
- **No test touches the network, Claude, Gemini, Obsidian or a real vault. The VM is Naresh's**; Claude Code never runs a command against the VM, GCP or the bucket.
- Update `docs/architecture.md` and the app `CLAUDE.md` files in the same commit as the part they describe.

---

## Checkpoint A: Docs and conventions
**Plan:** ✅ [`plans/checkpoint-a.md`](plans/checkpoint-a.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 1.1 | Kick-off: version 1.1.1 in every `package.json`, `apps/agent/pyproject.toml` and its `uv.lock` entry; `docs/README.md` lists v1.1.1 with this folder's docs; commit the four already-rewritten `CLAUDE.md` files (root, server, web, agent) and this `tasks.md` | | ⬜ |
| 1.2 | Move orphaned knowledge into `docs/architecture.md`: diff the previous `apps/server/CLAUDE.md` and `apps/web/CLAUDE.md` (`git show v1.1.0:…`) against `architecture.md`; any *behaviour* described only in the old files (worker fairness via `eligible_users`, `requestOrigin` trust rules, the vault-sync health-file format, the gate's decision order, the Melete generator's order of work) is added as prose about the system — never a file-by-file listing. No code changes | | ⬜ |
| 1.3 | `README.md` trimmed to: what Atlas is, running it locally, where the docs are. Version history moves to `docs/v*/release-notes.md` where it is missing; nothing is lost from git history | | ⬜ |
| 1.4 | `.env.example` carries a one-line comment for every variable (purpose, default, required or optional), because the server `CLAUDE.md` now points there. Check against `config.ts`; the two must agree | | ⬜ |

**Checkpoint A done when:** the docs describe the system once each (`architecture.md` for how, ADRs for why, `CLAUDE.md` for rules) and `pnpm test` is unchanged.

---

## Checkpoint B: Security fixes
**Plan:** ⬜ `plans/checkpoint-b.md`

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 2.1 | SSRF guard in `clients/http.client.ts`: resolve the host before every hop (`dns.lookup`, all addresses) and refuse loopback, link-local (`169.254/16`, `fe80::/10`), RFC1918, unique-local IPv6, `0.0.0.0`, `::`, and any non-http(s) scheme; the check runs again after each redirect; a refused address is a `ValidationError` "That address can't be fetched". Covers article fetch, feed preview, feed check and feed discovery. Tests: one per range, a public → private redirect, a hostname that resolves to a private address. Write the ADR first | 0096 | ⬜ |
| 2.2 | Released vaults are never claimable: `deleteUserAccount` and `resetVault` rename the folder to `.released/<vault_dir>-<ISO timestamp>` under `VAULTS_PATH` (made on first use, UID-owned like the rest); `listUnclaimedVaults` already ignores a leading dot. The admin frees a folder by moving it back by hand (one line in `docs/deploy.md`). Tests through the admin routes. Write the ADR first | 0097 | ⬜ |
| 2.3 | Ingested content is marked untrusted in every prompt: the summarizer's `toUserMessage`, the agent's linker request, Melete's question generation, mapping and syllabus calls wrap the note/transcript/article/email in a `<source_content>` block and the locked instructions say the block is data to work on, never instructions. **Stop and show Naresh the new locked wording before writing it**; locked prompts are his text. Pure-function tests on the built messages; the integration test is untouched | | ⬜ |
| 2.4 | `auth.service.ts` `readPending`: parse the cookie payload with a Zod `Pending` schema; an unparseable payload is `'failed'`. Test with a signed payload of the wrong shape | | ⬜ |
| 2.5 | `GET /api/health` answers only a loopback or private-network peer (`isTrustedProxy` from `requestOrigin.ts`); anyone else gets the usual 404. `deploy.sh`, the Compose healthcheck and `e2e` are unaffected (all local). Test both sides | | ⬜ |

**Checkpoint B done when:** a job for `http://agent:8100/` or `http://169.254.169.254/` fails with the new message, a removed user's vault folder is not offered to another user, and every Claude call's user message delimits the ingested text.

---

## Checkpoint C: Web restructure (behaviour-neutral)
**Plan:** ⬜ `plans/checkpoint-c.md`

Target layout (TRD §3): `src/app/` (shell, gate, routing helpers), `src/lib/` (formatters, `request`, `apiError`, `queryKeys` base), `src/features/<feature>/` (components, hooks, api and fixtures of one feature; each component keeps its `<Name>/` folder with `index.ts`), `src/test-support/` (render helpers and setup only), `src/test/` (the `public/` asset tests). One commit per feature so each is reviewable. Import paths change; nothing else does.

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 3.1 | `src/lib/` and `src/app/`: formatters (`formatBytes`, `formatDate`, `formatStudyTime`, `localDate`, `checkedAt`, `expiry`), `request`, `apiError`, `queryKeys`; `AppShell`, `NavDrawer`, `AuthGate`, `GatePage`, `HomeRedirect`, `RequireModule`, `ColorModeControl`, `moduleHome`, `moduleLabels`, `SignInPage`; `manifest.test.ts`, `manifestIcons.test.ts`, `browserSetup.browser.test.tsx` to `src/test/`. Write the ADR for the layout first | 0098 | ⬜ |
| 3.2 | `features/jobs`: submit form, job page and progress, review screen, note editor, link review, downloads, `useJob(s)`, `useAutosaveDraft`, `useDiscardJob`, link-suggestion hooks, `jobs.api`, `linkSuggestions.api`, their fixtures | 0098 | ⬜ |
| 3.3 | `features/feeds` and `features/inbox` (the seven `Feed*` components, `Inbox`, `InboxRow`, `SummarizeItemsDialog`, their hooks, apis and fixtures) | 0098 | ⬜ |
| 3.4 | `features/gmail` and `features/vault` (`Gmail*`, `gmailMatch`, `useGmail*`, `gmail.api`, `gmailSources.api`; `ChooseVault`, `FolderPicker`, `useFolders`, `useVaultChoices`, `vault.api`) | 0098 | ⬜ |
| 3.5 | `features/settings`, `features/status`, `features/admin` (settings layout and tabs, prompts, models, `StatusPanel` and its parts, `Admin*`, `Usage*`, their hooks, apis and fixtures) | 0098 | ⬜ |
| 3.6 | `features/melete` (`Melete*`, `Syllabus*`, `Subject*`, `Review*`, `GapConceptRow`, `SuggestResources`, `syllabusDraft`, `syllabusLevels`, `searchLink`, their hooks, `melete.api`, `syllabus.api`, `gaps.api`, fixtures) | 0098 | ⬜ |
| 3.7 | `features/themis` (`Themis*`, `Goal*`, `Area*`, `AllGoals`, `CheckinsDue`, `TimeByArea`, `TimeBar`, `LogTime*`, `MetricUpdateDialog`, `LinkSubjectsDialog`, `goalForm`, their hooks, `themis.api`, `timeEntries.api`, fixtures); `src/` root holds only `main.tsx`, `App.tsx`, `routes.tsx`, `theme.ts`, `queryClient.ts` | 0098 | ⬜ |
| 3.8 | Delete the mirror tests: hook tests whose every assertion is "the mocked api function was called" or "`invalidateQueries` was called", and `*.api.test.ts` files that only check the URL string and that the schema parses. Keep every hook test with its own logic (`useAutosaveDraft`, `useUnsavedChangesGuard`, debounce, review state, polling) and every component test. List each deleted file in the log line | 0098 | ⬜ |
| 3.9 | `apps/web/CLAUDE.md` Layout block and folder rule, `docs/architecture.md`, and the `#src/*` alias in `tsconfig.app.json` / `vite.config.ts` if it changed; `test`, `test:browser`, `lint`, `typecheck`, `build` all green | 0098 | ⬜ |

**Checkpoint C done when:** every page renders as before (check each in the browser and say so), the `src/` root has five files, and no test file sits outside its feature except in `src/test/` and `src/test-support/`.

---

## Checkpoint D: Server structure and performance (behaviour-neutral)
**Plan:** ⬜ `plans/checkpoint-d.md`

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 4.1 | Split `services/jobs.service.ts`: `jobs.service.ts` (queue, find, list, `moveTo`, `markStatus`, fail, recover, expiry), `jobLinking.service.ts` (run, record, suggestions accept/reject), `jobDraft.service.ts` (`updateDraft`, `saveJob`, `discardJob`, `submitPastedText`), `jobRender.service.ts` (`renderTranscript`, `getSource`, `findSource`). Tests move with their functions; no test changes otherwise | | ⬜ |
| 4.2 | `SELECT_JOB` in `jobRows.ts` names its columns and leaves out `source_document` and `note_markdown`; only the source and review reads fetch them. A test asserts the list query returns no transcript | | ⬜ |
| 4.3 | `listJobs` without an N+1: summary usage and link usage in one query each over the listed job ids; `defaultFolderFor` resolved once per profile per call. A test counts prepared statements (or spies on the repositories) for a list of ten jobs | | ⬜ |
| 4.4 | Schema SQL out of `database.ts`: the baseline and each migration in `repositories/sql/<version>-<name>.sql`, read at startup; `migrations.lock.json` hashes the file bytes; `migrations:lock`, `release.sh` and `database.upgrade.test.ts` unchanged in behaviour. Existing hashes must still verify, so the SQL bytes are copied exactly. Write the ADR first | 0099 | ⬜ |
| 4.5 | Event-driven loops: `queueJob` (and retry/regenerate/run-linking) wakes the worker through a small emitter; enrol/regenerate/approve wake the Melete generator; the safety poll becomes 15 s. Shutdown and the restart recovery unchanged. Fake-timer tests for "a queued job starts within the same tick" and "the poll still finds a job queued by another path". Write the ADR first | 0100 | ⬜ |
| 4.6 | `apps/web/src/lib/request.ts`: a response that fails its schema throws `ApiError` with the first Zod issue path and message appended, so a contract drift is readable | | ⬜ |

**Checkpoint D done when:** `pnpm test` is green with the same assertions, the Status panel and job list behave as before in the browser, and a queued job starts without waiting for the poll.

---

## Checkpoint E: Modules registry and release
**Plan:** ⬜ `plans/checkpoint-e.md`

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| 5.1 | Modules defined once: `ModuleId` in `@atlas/shared` is the registry; migration 17 (test-first against `schema-16.sql`, then locked with its seed) drops the `CHECK` on `user_modules.module` and rebuilds `eligible_users` without a hard-coded module list (application code validates with `ModuleId`); `app.ts` mounts `requireModule` from one table of `{ module, paths }`. Adding a module is then one shared enum entry plus its routes. Write the ADR first | 0101 | ⬜ |
| 5.2 | `docs/deploy.md`: the per-user `sync-<name>` block in `compose.prod.yml` documented as the manual step it is, with the exact edits for a new user | | ⬜ |
| 5.3 | `release-notes.md` for 1.1.1; `pnpm e2e` green; final report | | ⬜ |

**Checkpoint E done when:** `pnpm test`, `lint`, `typecheck` and `e2e` are green across the repo and the release notes list every ADR 0096–0101.

## Log
_(one line per ticked task: id, commit hash, moved or deleted test files)_
