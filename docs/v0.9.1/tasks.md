# Tasks — Mnemosyne v0.9.1

Built from `prd.md` and `trd.md` in this folder. Tasks run strictly in order. Each one is test-first (ADR 0007) and ends in its own commit.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done (tests green, committed, pushed) · ⏸️ Deferred
**Plan:** ⬜ Not approved · ✅ Approved (the link points to the saved plan)

## How this file works
- Work is grouped into checkpoints. Each checkpoint covers one or more phases.
- **Start of a checkpoint:** in plan mode, write one plan for every task in it (files to touch, tests to write first, expected red → green path). Then stop. When Naresh approves it, save the plan to the linked file, tick the checkpoint's Plan cell, and commit.
- **During a checkpoint:** work through its tasks without stopping. For each task: failing tests first → green → refactor → tick Status → commit (`feat(0.9.1-<id>): …`, `fix(0.9.1-<id>): …`, `refactor(0.9.1-<id>): …`, plans as `docs(0.9.1-plan): checkpoint <x>`, etc.) → push.
- **End of a checkpoint:** stop and report what was built, test/lint/typecheck results per package (and `test:browser` for web), browser screenshots (light and dark; phone width) of any screen touched, `pnpm e2e` (at the end of **both** checkpoints, TRD §8.4), anything deferred, and any ADR that changes the TRD. Don't start the next checkpoint until Naresh says so.
- Never start a task whose checkpoint Plan cell is ⬜.
- If something isn't covered by the PRD, TRD or ADRs, stop and ask. Record the decision as the next ADR (from 0073) and add its number to the task's ADR column.
- **This is a patch release.** No schema change, no new dependency, no new endpoint. The only vault write Melete's code path gains is the learning-root folder created in `updateSettings` (ADR 0072); the scan, generator and review stay read-only.
- **No test touches the network, Google, the Claude API or a real vault.** Permission tests use a temporary vault and skip under root (TRD §8.1).
- Existing tests pass unchanged, except where the TRD changes a signature, a message or a fixture (TRD §8.1); list each changed file in the log line.
- Add a one-line note to the log at the bottom whenever a task is ticked.

---

## Checkpoint A: Phases 1–3 (kick-off, learning root, Obsidian link)
**Plan:** ✅ [`plans/checkpoint-a.md`](plans/checkpoint-a.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 1** | **Kick-off** | | |
| 1.1 | Version 0.9.1 in every `package.json`, `apps/agent/pyproject.toml`, the agent's `uv.lock` entry and the README status line; confirm `docs/README.md` lists v0.9.1 and ADR 0072 (added with the plan) | | ✅ |
| **Phase 2** | **Learning root created on save (TRD §3)** | | |
| 2.1 | `resolveFolder` maps `EEXIST` / `ENOTDIR` from `mkdir` to a 400 `ValidationError` ("A file is in the way of folder …"); `updateSettings` validates `melete_learning_root` with `resolveFolder`; guard test that `settings.service.ts` is the only importer of `resolveFolder` (the job save uses `writeNote`) and no Melete module imports it; tests first in `vault.client.test.ts`, `settings.service.test.ts`, `settings.routes.test.ts` | 0054, 0072 | ✅ |
| 2.2 | Web: `LearningRootSetup` test for a new folder's path; e2e `melete.spec.ts` sets the learning root with **New folder** and asserts the folder exists in the e2e vault | 0053, 0072 | ✅ |
| **Phase 3** | **Obsidian link per user (TRD §5)** | | |
| 3.1 | `vaultDirFor( userId )` in `vault.service.ts`; `melete.service.ts` and `meleteReview.service.ts` build `obsidian_url` from it; two-user test (same note path, two links); tests first | 0063 | ✅ |
| 3.2 | `OBSIDIAN_VAULT_NAME` out of `config.ts` and into `IGNORED_VARIABLES` (test: ignored and reported); both `.env.example` files, the e2e Compose override if it sets it, README (variables table, phone step, Melete variables note, troubleshooting entry), `apps/server/CLAUDE.md` | | ✅ |

**Checkpoint A done when:** 0.9.1 everywhere; a new learning root can be created from Settings; the Obsidian link opens each user's own vault; `pnpm test`, lint, typecheck, build green in every folder; `pnpm e2e` green.

---

## Checkpoint B: Phases 4–6 (unreadable folders, docs and release)
**Plan:** ✅ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 4** | **Folder picker (TRD §4.1–4.2)** | | |
| 4.1 | `isSkippable( error )` in `vault.client.ts`; `listFolderTree( vaultPath, relativeFolder, onSkip? )` skips an unreadable subfolder and still throws for the root; `listFolders` logs each skip at `warn` with `user_id`, `path`, `code`; permission tests skipped under root; tests first | 0049 | ✅ |
| **Phase 5** | **Scan (TRD §4.3–4.7)** | | |
| 5.1 | Shared: `GetMeleteTodayResponse.skipped_paths` (required `string[]`), its tests, and every fixture in `packages/shared`, `apps/server` and `apps/web` that builds the response (`skipped_paths: []`), in one commit so every package stays green | | ✅ |
| 5.2 | `walkSubject` returns `{ files, skipped }` (unreadable subdirectory or file → skipped path, root still throws); `readNote` distinguishes gone from unreadable; `runScan` collects skipped paths (a subject folder that can't be entered counts as one), passes them to `applyScan`, which leaves notes under a skipped path out of the missing loop and out of `movedFrom`; `melete/scanOutcome.ts` (`rememberSkipped`, `lastSkipped`, `resetScanOutcome`); one `warn` line per scan with skipped paths; tests first in `scan.test.ts` and `meleteScan.service.test.ts` (notes under a skipped folder keep state, enrolment and questions; no false move; fresh scan leaves the remembered list alone) | 0049, 0057 | ✅ |
| 5.3 | `getToday` returns `skipped_paths` (both branches); `MeleteToday` warning notice with the paths (collapsed past 5); unit tests and one browser test (phone and desktop, light and dark, long path, no sideways scroll); `apps/web/CLAUDE.md` | 0057 | ✅ |
| **Phase 6** | **Docs and release** | | |
| 6.1 | Root `CLAUDE.md` (Melete sentence per ADR 0072, Obsidian mention), `apps/server/CLAUDE.md` (`scan.ts`, `vault.client.ts`, `scanOutcome.ts`, env list); README troubleshooting entries for a folder missing from the picker and the Melete notice; `docs/v0.9.1/release-notes.md` from TRD §10, linked from `docs/README.md`, whose v0.9.1 entry becomes "done" | 0072 | ✅ |
| 6.2 | Final checks: all tests, lint, typecheck, build, browser tests, the agent's tests, `pnpm e2e`, `docker compose build`. With Naresh (TRD §10 step 3): a new learning root from Settings; a `chmod 000` subfolder in a vault — absent from the picker with a warning in the logs, listed in the Melete notice with its notes still reviewable, notice gone after `chmod 755` and the next scan; **Open in Obsidian** as both users | 0072 | ✅ |

**Checkpoint B done when:** every task above is ✅, `pnpm e2e` green, release notes in place, manual checks reported by Naresh.

---

## Log
- 1.1: version 0.9.1 in the root, e2e, web, server, agent and shared `package.json`, `pyproject.toml`, the agent's `uv.lock` entry and the README status line; `docs/README.md` already lists v0.9.1 and ADR 0072. No test changed. (The first web test run hit a vitest-cache error; the rerun passed, 184 files.)
- 2.1: `resolveFolder` maps `EEXIST` / `ENOTDIR` (from the ancestor check or `mkdir`) to a 400 "A file is in the way of folder …"; `updateSettings` validates the learning root with `resolveFolder`; new `resolveFolder.guard.test.ts`. Changed tests: `settings.service.test.ts` and `settings.routes.test.ts` ("doesn't exist" cases now create the folder; "saves nothing when refused" uses `../Nowhere`).
- 2.2: `LearningRootSetup.test.tsx` gains a New-folder case (a characterization test: it passed on first run because the component needed no change); `e2e/tests/melete.spec.ts` sets the root with **New folder** (`Study`), asserts the folder exists in the e2e vault, then continues on `Learning`. `pnpm e2e` 7 passed.
- 3.1: `vaultDirFor( userId )` in `vault.service.ts`; `melete.service.ts` and `meleteReview.service.ts` build `obsidian_url` from it (their `config` import is gone). Changed tests: `melete.service.test.ts`, `meleteReview.service.test.ts` and `melete.routes.test.ts` (the `obsidianVaultName` setup is replaced by the user's `vault_dir`; the route test that expected a null link now expects the user's vault link); new two-user tests in both service tests and `vault.service.test.ts`. I wrote tests and code in one pass here, so the red run was not watched for this task.
- 3.2: `OBSIDIAN_VAULT_NAME` out of `config.ts` (schema and `obsidianVaultName`) and into `IGNORED_VARIABLES`; both `.env.example` files, the README (phone step, variables table, Melete variables note, troubleshooting entry) and `apps/server/CLAUDE.md` updated; the e2e Compose override never set it. Changed test: `config.test.ts` (the `obsidianVaultName` expectations removed, an ignored-and-reported test added).
- 4.1: `isSkippable` and `listFolderTree( …, onSkip )` in `vault.client.ts` (an unreadable subfolder stays in the tree with no children; the root still throws); `listFolders` logs one `warn` per skip with `user_id`, `path`, `code`. New tests in `vault.client.test.ts` and `vault.service.test.ts` (permission cases skip under root); no existing test changed. Server tests 3079, lint and typecheck green.
- 5.1: `GetMeleteTodayResponse.skipped_paths` (required `string[]`) in `packages/shared/src/melete.ts`; `getToday` returns `[]` for now (real value in 5.3). New test in `melete.test.ts`; changed: `melete.test.ts` (two parse cases gain the field), `apps/server` `melete.service.test.ts` and `melete.routes.test.ts` (the no-learning-root expectations), `apps/web` `test-support/melete.fixture.ts`. Shared 694, server 3079, web 1659 tests; lint and typecheck green.
- 5.2: `walkSubject` returns `{ files, skipped }` (unreadable subdirectory or note → skipped path; the subject root still throws); `readNote` answers `'gone'` / `'unreadable'`; `runScan` collects skipped paths (a subject folder it can't enter is one), `applyScan` leaves notes under them out of the missing loop and out of `movedFrom`; new `melete/scanOutcome.ts` and one `warn` per scan with skips. Changed tests: `scan.test.ts` (walkSubject results read `.files`). New: `scanOutcome.test.ts` and a block in `meleteScan.service.test.ts` (permission cases skip under root; the move guard was checked by removing it and watching its test fail). Server 3097 tests; lint and typecheck green.
- 5.3: `getToday` returns `lastSkipped( userId )` (both branches); the warning is a new `MeleteSkippedNotice` component (its own Show/Hide state, so `MeleteToday` stays small) rendered by `MeleteToday` above the totals. New tests: `MeleteSkippedNotice.test.tsx`, two cases in `MeleteToday.test.tsx`, `MeleteToday.browser.test.tsx` (phone/desktop, light/dark, long path, no sideways scroll; screenshots looked at in Chromium), and `getToday` / `/today` cases in the server tests. No existing test changed. Server 3100, web unit and browser green; lint and typecheck green.
- 6.1: root and server `CLAUDE.md` (the Melete sentence per ADR 0072, the scan and picker skipping, `scan.ts`, `scanOutcome.ts`, `vault.client.ts`, ADR 0072 in the server's list; the Obsidian variable was already gone in 3.2), README troubleshooting (the stale "Folder doesn't exist" entry replaced, one new entry for a folder missing from the picker and the Melete notice), `docs/v0.9.1/release-notes.md` from TRD §10 linked from `docs/README.md` with v0.9.1 marked done. ADR 0054 already said "amended by 0072". No code or tests changed.
- 6.2 (automated part): shared 694, server 3100 and web 1665 unit tests, web browser 70 (Chromium and WebKit), agent 280 passed; lint, typecheck and build clean in shared, server and web; agent ruff and pyright clean; `pnpm e2e` 7 passed; `docker compose build` built both images. Two full web unit runs failed 3 and 7 unrelated tests (`FolderPicker`, `GmailSettings`, `AdminTab` and others) while several vitest processes ran at once; they passed alone and in a full run on a quiet machine, so the cause looks like timeouts under load, not the code. Still 🟨: the manual checks with Naresh (TRD §10 step 3).
- 6.2 (manual): Naresh ran TRD §10 step 3 and reported all checks good: a new learning root from Settings, an unreadable subfolder (absent from the picker with a warning in the logs, listed in the Melete notice with its notes reviewable, notice gone after `chmod 755` and the next scan) and **Open in Obsidian** as both users. 6.2 ticked; Checkpoint B and v0.9.1 are done. All `package.json`, `pyproject.toml` and `uv.lock` entries were already 0.9.1 (task 1.1); the README gains the `skipped_paths` line.
