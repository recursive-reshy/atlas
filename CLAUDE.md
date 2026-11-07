# CLAUDE.md — Atlas (repo root)

Atlas is a local-first app (its first module, the transcriber, is labelled Mnemosyne; Melete is the second), used by Naresh (the admin) and his brother, that turns a YouTube URL or an article into a transcript or a reviewed summary note for Obsidian, and quizzes you on your notes. Each person signs in with Google, has their own vault under a shared vaults folder, and sees only the modules the admin has switched on. Later it may summarise transcripts and write notes straight into an Obsidian vault. It runs in Docker: on Naresh's Mac for development (`docker-compose.yml` plus `compose.local.yml`, which builds the images), and in production on one Google Cloud VM (`docker-compose.yml` plus `compose.prod.yml`, images from Artifact Registry, ADR 0077), where the whole runbook is `docs/deploy.md`.

This file holds only what is true everywhere. Each app has its own `CLAUDE.md` with its language, style and local rules, so read that one before working in the folder.

## Folders

| Folder | What it is |
| --- | --- |
| `apps/server` | Express API: jobs, worker, Gemini and YouTube Data clients, formatters; Melete services, scanner, scheduler and generator loop |
| `apps/web` | React UI (screens only), including the Melete pages and review screen |
| `apps/agent` | Python vault agent service: stateless, read-only vault tools and Claude tool-use agents; linking is its first endpoint (ADR 0042) |
| `packages/shared` | Cross-app contracts: Zod schemas and their inferred types |
| `e2e/` | End-to-end smoke test (ADR 0053): Playwright specs signed in through the test-only session route, local fakes (article, feed, Gemini and the YouTube Data API, Anthropic API) and a Compose override; run with `pnpm e2e` |
| `deploy/` | Hosting (ADRs 0075–0078): the Obsidian Sync client image and `sync.sh`, the Litestream config, the VM scripts (`bootstrap.sh`, `fetch-secrets.sh`, `deploy.sh`, `atlas.service`, `atlas.env.example`) and `release.sh`; `deploy.sh` checks `GET /api/health` replication before an upgrade, records `/var/lib/atlas/deploys.log` and rolls back past a migration with `--restore-pre-migration` (ADR 0086); each has a `node:test` file beside it, run by the root `pnpm test`; every third-party image is pinned as `tag@sha256:…` and `images.test.mjs` fails on a tag alone (ADR 0087) |
| `docs/` | Versioned plans in `docs/v<version>/` (PRD, TRD, tasks, checkpoint plans) and ADRs in `docs/decisions/`, indexed in `docs/README.md` |

## Architecture

Atlas turns a YouTube URL or an article into a transcript or a reviewed summary note for Obsidian, and quizzes you on your notes.
- `apps/server` queues a job per URL and a worker runs it in the background, one at a time, through a source adapter: Gemini transcribes a YouTube link, the server itself reads an article, a feed item or an email; Claude then writes the summary from a prompt profile that is edited in Settings.
- `apps/agent` is a read-only Claude tool-use service over the vault that suggests `[[wikilinks]]`; `apps/web` is the React UI, where each note is reviewed, edited and saved into the person's vault folder (the only write to the vault).
- Two modules: the transcriber (Mnemosyne) and Melete, which schedules recall questions on the notes in a learning folder with FSRS. Each person signs in with Google, has their own data and vault, and sees only the modules the admin switched on.
- Data is one SQLite database, forward-only migrations, and every job status is defined once in `lifecycle.ts`.
- It runs in Docker: on Naresh's Mac for development, and on one Google Cloud VM in production (Litestream replication, Obsidian Sync for the vaults, Tailscale for access); `docs/deploy.md` is the runbook.
- Read docs/architecture.md before changing how a part works; update it in the same commit when you do.

The reasons behind each part are in `docs/decisions/`. Read the ADRs a task lists before starting.

## Workflow

Work is planned in versioned docs: `docs/v<version>/prd.md` (what and why), `trd.md` (how) and `tasks.md` (ordered tasks grouped into checkpoints). The current version is **1.0.0** (planning docs stay in `docs/v0.11.0` until v1.1 starts). Only Naresh edits the PRD and TRD; `tasks.md` is the only planning doc you edit, and you also write ADRs and checkpoint plans.

At the start of every session:
1. Read `docs/v0.11.0/prd.md`, `trd.md` and `tasks.md`, and the ADRs listed against the next unticked task.
2. Say which checkpoint and task is next, in one line.
3. If that checkpoint's Plan cell is ⬜: enter plan mode and write one plan for every task in the checkpoint (files to touch, tests to write first, expected red → green path). Stop. When Naresh approves it, save it to `docs/v0.11.0/plans/checkpoint-<x>.md`, tick the Plan cell, commit, push, then start the first task.
4. If the Plan cell is ✅: read the saved plan and continue from the first unticked task.

Within a checkpoint, work through its tasks without stopping. For each task: failing tests first and watch them fail → least code to pass → refactor while green → tick Status and add a log line in `tasks.md` → commit → push. At the end of the checkpoint, stop and report (see "Before you stop").

If something isn't covered by the PRD, TRD, ADRs or the approved plan (a new dependency, endpoint, job status, contract change or folder), stop and ask. When Naresh decides, write the next-numbered ADR, add it to `docs/README.md` and to the task's ADR column, then continue.

## Precedence

1. An ADR listed in `tasks.md` overrides the TRD where they conflict, until Naresh updates the TRD. Mention it in the checkpoint report (e.g. "ADR 0019 changes TRD §8").
2. The TRD and ADRs override any `CLAUDE.md` or `docs/architecture.md` description of the current architecture. When a task changes something a `CLAUDE.md` or `docs/architecture.md` describes, update it in the same commit.
3. Any other conflict, or a doc that looks wrong: stop and ask. Don't pick one, and never edit the PRD or TRD.

## Rules that span apps

- **TDD, always.** Write the failing test first, run it and watch it fail for the right reason, write the least code that passes, then refactor while green. Each app's `CLAUDE.md` says how this runs there.
- **Contracts live in `packages/shared`** as Zod schemas, imported by package name (`@atlas/shared`). Neither app redefines a shape the other one uses. One exception (ADR 0043): the agent service's contract is Pydantic-first (`apps/agent/src/atlas_agent/contract/`), mirrored by hand in `packages/shared/src/agent.ts`, and a contract change is one commit covering the models, the committed JSON Schema export, the golden examples and the Zod mirror.
- **Transcription is an HTTP call.** The server gives the Gemini API a YouTube link; it never downloads the video or runs a speech model itself.
- **The stored transcript is the source of truth.** Markdown and TXT are rendered from it by pure formatters; Markdown is never stored as the canonical data.
- **No secrets in the repo.** Environment files stay out of git; `.env.example` lists the variable names only.
- **Don't add a dependency** unless the TRD or an ADR names it. Ask instead.
- **Database changes (ADRs 0084, 0085).** Schema 13 is the 1.0 baseline and the production database is never reset, recreated or hand-edited.
  - A schema change is a new migration appended to `migrations` in `apps/server/src/repositories/database.ts`.
  - Never edit, reorder or remove a locked migration (its hash is in `migrations.lock.json`; even reformatting its SQL breaks the hash) and never change `SCHEMA_BASE`. Fix a mistake with a later migration.
  - Each new migration needs, written first: a seed for the schema it starts from (`fixtures/schema-<N>.sql`, invented data, every table filled), a test against that seed in `database.upgrade.test.ts`, and an entry in its `ALLOWED_COUNT_CHANGES` if it adds or removes rows.
  - Lock it with `pnpm --filter @atlas/server migrations:lock` and commit the lock file; locking also needs the new schema's own seed, because every locked version from 13 must have one. `deploy/release.sh` refuses to build with an unlocked migration.

## Git

- From v1.1, work happens on the release branch named in the version's `tasks.md` (for example `release/1.1.0`), never on `main`. One commit per task, containing its code, tests and the `tasks.md` update. Push after every commit to that branch.
- Never merge, never tag, never push to `main`: Naresh merges the release branch with `--no-ff`, releases from `main` and tags.
- Branch names never equal a tag name (no branch called `v1.1.0`).
- If `main` gets a fix during a release (a 1.x.y), Naresh merges `main` into the branch. A new migration on the branch is renumbered after any migration that came from `main`, before it is locked.
- Conventional messages scoped by version and task id, so every scope is unique across versions: `feat(0.9-3.2): Claude client`, `refactor(0.9-6.1): useJob on TanStack Query`, `docs(0.9-plan): checkpoint B`. Use major.minor for the version (`0.9`), and the full version for a patch release (`0.7.1-2.3`).
- Stage files by name; never `git add -A` or `git add .`. Never commit `.env` or anything with a secret.
- Never `--amend`, rebase, force-push, `reset`, `stash`, `checkout -- <file>` or `restore`. If a commit is wrong, fix it in a new commit.
- If a push fails, stop and report it; don't try to resolve it.

## Before you stop

After each task, run the tests, lint and typecheck for every folder it touched; a task isn't ticked until all of them pass. At the end of every checkpoint from F on, also run `pnpm e2e` (it builds the Compose stack against local fakes and tears it down; needs Docker running). At the end of a checkpoint, report:
- what was built, task by task, with commit hashes;
- test, lint and typecheck results per folder, and the `pnpm e2e` result;
- any ADRs written and whether they change the TRD;
- anything deferred or worth a follow-up.
