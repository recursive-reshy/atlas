# Checkpoint A plan — Atlas v0.10.0, phases 1–2 (tasks 1.1–2.4)

## Context
ADR 0073 renames the app from Mnemosyne to Atlas before any cloud resource exists. The rename is behaviour-neutral. The transcriber module keeps its ID `transcriber` and is labelled "Mnemosyne". The `mnemosyne` note tag and the `Mnemosyne` default folder stay (TRD §2.2). 0.9.1 is closed.

Surveyed from `git grep -i mnemosyne` outside `docs/`: about 800 hits in about 230 files. Roughly 320 files import `@mnemosyne/*`, and the agent's `mnemosyne_agent` imports and the test files make up most of the remaining hits. The non-import hits are listed per task below.

Per task: failing test first, then least change, then all checks for the touched folders, then tick `tasks.md` and add a log line, then commit and push. Stage files by name. Commit scope is `feat(0.10-<id>)`, ending with the Co-Authored-By line.

## Before task 1.1: save this plan
Write it to `docs/v0.10.0/plans/checkpoint-a.md`, tick the Plan cell in `tasks.md`, and commit `docs(0.10-plan): checkpoint A`. The cell then reads ✅.

## Task 1.1 — Version 0.10.0
- **Test first:** none fits. A version string is not behaviour. Verification is a script check that the files below agree.
- **Files:**
  - `package.json` files at root, `apps/server`, `apps/web`, `apps/agent`, `packages/shared` and `e2e`.
  - `apps/agent/pyproject.toml` and the `uv.lock` entry for the agent. Regenerate it with `uv lock` (offline if possible) rather than hand-editing.
  - The README status line. Its sentence "Version 0.9.1" becomes 0.10.0.
- `docs/README.md` already lists v0.10.0 and ADRs 0073–0078. Verify only.
- `appVersion` feeds the `User-Agent` header (`http.client.test.ts`). Check where it is read from. If it comes from `package.json`, tests stay unchanged.
- **Done check:** `grep -r '"version"'` shows 0.10.0 everywhere. Server, web and agent tests are green.
- **Commit:** `feat(0.10-1.1): version 0.10.0`

## Task 2.1 — `@mnemosyne/*` → `@atlas/*`
- **Test first:** a throwaway check that `git grep '@mnemosyne/'` is empty. It fails now and is replaced by the guard in 2.4.
- **Changes:**
  - Package `name` in the root (`mnemosyne` → `atlas`), shared, server, web, agent, e2e. The root `e2e` script filter becomes `@atlas/e2e`.
  - Every import and `workspace:` dependency, applied with one scripted `sed` over tracked files.
  - Also check these for the old scope: tsconfig `paths`, Vite and Vitest aliases, package `scripts`, the Dockerfile (`pnpm --filter`), and `pnpm-workspace.yaml`.
  - Regenerate `pnpm-lock.yaml` with `pnpm install`.
- **Green path:** one commit, then `pnpm test`, `lint`, `typecheck`, `build`, and the web `test:browser` project.
- **Commit:** `feat(0.10-2.1): workspace packages are @atlas/*`

## Task 2.2 — `mnemosyne_agent` → `atlas_agent`
- **Test first:** the agent's `tests/` imports change to `atlas_agent` first, so pytest fails to import. Then `git mv apps/agent/src/mnemosyne_agent apps/agent/src/atlas_agent`.
- **Changes:**
  - Imports in src and tests, and `pyproject.toml` (`name = "atlas-agent"`, the packages and entry config, and the Ruff, Pyright and pytest paths).
  - The `uv.lock` entry, regenerated.
  - The agent Dockerfile start command (`uvicorn atlas_agent.main:app`).
  - The `apps/agent/package.json` name.
  - `tests/docker/test_container.py`: image `mnemosyne-agent:test` → `atlas-agent:test`.
  - Logger names and service fields in `logging_setup.py`, `main.py`, `config.py` and `contract/export.py` where they say mnemosyne. `test_logging_setup.py` and `test_main.py` assert them.
- **Check:** the committed JSON Schema export is unchanged. Regenerate it and require no diff.
- **Green path:** `uv run pytest`, `ruff check` and `pyright`. The Docker test runs if Docker is up.
- **Commit:** `feat(0.10-2.2): agent package is atlas_agent`

## Task 2.3 — Runtime and UI names (TRD §2.1)
Each change gets its test updated first, and the test is watched failing. The tests are listed per change.

| Change | Files | Test |
| --- | --- | --- |
| `atlas.db` | `server.ts:44`, `scripts/save-gmail-fixture.ts`, `config.ts` default work and data dirs (`atlas`, `atlas-data`) | `config.test.ts`, `database*.test.ts`, `jobStore.repository.test.ts`. Temp-dir prefixes stay or change freely. |
| Session cookie `atlas_session` | `session.service.ts` | `middleware/auth.test.ts:94` |
| OAuth cookie `atlas_oauth` and its derive label `atlas-oauth-cookie` | `auth.service.ts` | auth route tests. The label feeds the HKDF key, so it only invalidates in-flight sign-ins. |
| `User-Agent: Atlas/<v>` | `http.client.ts:123` | `http.client.test.ts:76` |
| Strings that name the app | `gmail/auth.ts` revoked reason, `database.ts:481` "newer version of Atlas", `useGmailRedirectNotice.ts`, `GmailSettings.tsx` and its `SETUP_URL` (becomes `…/atlas#…`; GitHub redirects until the repo is renamed), `DeleteUserDialog.tsx` | the tests that assert those strings (`auth.test.ts:399`, `database.test.ts:120`) |
| Page title, manifest, drawer header, sign-in and not-allowed pages | `apps/web/index.html`, `public/manifest.webmanifest`, `AppShell.tsx:64`, `AuthGate.tsx`, `GatePage.tsx` | web unit tests |
| Module label **Mnemosyne** | `moduleLabels.ts`, `NavDrawer.tsx` ("Transcriber" → "Mnemosyne") | their tests. The Settings admin module toggles use the same label. |
| localStorage keys `mnemosyne:nav-drawer`, `mnemosyne:draft:` | `useNavDrawer.ts`, `useRemoveLegacyDrafts.ts` | See open question 1. |
| Compose | `docker-compose.yml`: `name: atlas`, services `app` and `agent`, volume `data`, images `atlas-app:local` and `atlas-agent:local`. Repo `Dockerfile` `WORK_DIR=/tmp/atlas`. Anything that names the service `mnemosyne` (`server.ts` wiring, `AGENT_URL` hostnames and similar). | `docker compose config` |
| e2e | `e2e/docker-compose.e2e.yml` (`app` service, `atlas-e2e:local`, `atlas-agent-e2e:local`), `e2e/run.sh` (`PROJECT=atlas-e2e`), `e2e/fakes/fixtures.mjs` footer | `pnpm e2e` |
| `.env.example` files | comments (`/mnemosyne-backups`, `<OS temp dir>/mnemosyne`) | none |

**Must not change:**
- the `mnemosyne` tag in `shared/note.ts`, `summary.cleanup.ts`, `PropertiesPanel.tsx`, `TagInput.tsx`
- `defaultNoteFolder: 'Mnemosyne'`
- `vault.client.test.ts`, `note.formatter.test.ts` and `summary.cleanup.test.ts` expectations

A passing test run over those proves that.

**Other things to check:**
- `apps/server/src/errors.ts` and the controllers matched the grep through the import only, so the rename touches nothing else there.
- Any hostname `mnemosyne` in `AGENT_URL`. Compose and `.env.example` must say `http://agent:…`.

**Commit:** `feat(0.10-2.3): runtime and UI names are Atlas, module is labelled Mnemosyne`

## Task 2.4 — Guard, docs, full run
- **Test first:** `scripts/nameGuard.test.mjs` at the root. Add the root script `"test": "pnpm -r test && node --test scripts/nameGuard.test.mjs"` (or the equivalent for the repo's test setup). It runs `git grep -n -i mnemosyne` and fails on any match outside the allow-list in TRD §2.3:
  - `docs/v0.1`…`v0.9.1/**` and `docs/decisions/00[0-6]*`, `0070`–`0072`
  - `docs/v0.10.0/**`, ADR 0073, and `docs/README.md` lines that name the module or the history
  - the tag and folder defaults and their tests (exact files listed in the test)
  - the module label files and their tests
  - the summarizer's locked tag constant

  Run it first and watch it fail on the not-yet-updated docs.
- **Docs updated:**
  - The root `README.md`: title and the app description. The module is called Mnemosyne where it is meant. Variables table paths (`atlas`, `atlas-data`, `atlas.db`, volume `data`). The troubleshooting line `docker compose logs atlas-app` becomes `app`. The "newer version of Atlas" line. New note on removing the old local volume (TRD §2.4: `docker volume rm mnemosyne_mnemosyne-data`) and that Docker starts with an empty `atlas.db`.
  - Root, `apps/server` and `apps/web` `CLAUDE.md`. `apps/agent/CLAUDE.md` and `apps/agent/README.md` also mention the old name, so I update them as well.
  - `docs/README.md`.
  - The root `CLAUDE.md` current version becomes 0.10.0, and its first paragraph says Atlas with Mnemosyne as the transcriber module.
- **Full run:** `pnpm test`, `lint`, `typecheck`, `build`, web `test:browser`, agent `pytest`/`ruff`/`pyright`, `pnpm e2e`, `docker compose build`.
- **Commit:** `feat(0.10-2.4): name guard test and Atlas docs`

Each commit also ticks the task in `tasks.md` and adds a log line. The log lists any changed test files.

## Open questions
1. localStorage keys: rename to `atlas:…` (the stored drawer state resets once), or keep (the guard allow-list gains two lines)? **Recommended: rename.** The `mnemosyne:draft:` key only exists to delete legacy drafts. Renaming it would leave the old drafts in place, so keep that one string and allow-list it. Rename the drawer key.
2. `GmailSettings` `SETUP_URL` points at the GitHub repo. I change it to `…/atlas` now (GitHub redirects the old path after you rename).

## After the checkpoint
Stop and report per CLAUDE.md "Before you stop". You then rename the GitHub repo, run `git remote set-url`, move the folder to `~/Documents/Github/atlas`, and reopen it in your tools.
