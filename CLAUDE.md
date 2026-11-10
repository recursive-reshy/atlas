# CLAUDE.md — Atlas (repo root)

Atlas is a two-user, local-first app (Naresh is the admin; his brother is the other user). Modules: **Mnemosyne** turns a YouTube URL, article, feed item or newsletter into a reviewed summary note for Obsidian; **Melete** quizzes you on notes with FSRS; **Themis** tracks life goals and time. Each user signs in with Google, owns one vault under a shared vaults folder, and sees only the modules the admin switched on.

This file holds only what is true everywhere. Each app's `CLAUDE.md` has its language, style and local rules: read it before working in that folder. The current state of the architecture is `docs/architecture.md`; the reasons are the ADRs in `docs/decisions/`. **Read the code, not a description of it, to learn how something works today.**

## Folders

| Folder | What it is |
| --- | --- |
| `apps/server` | Express API, SQLite, worker loops, Gemini/Claude/YouTube clients |
| `apps/web` | React UI, screens only |
| `apps/agent` | Python FastAPI vault agent (read-only, wikilink suggestions) |
| `packages/shared` | Zod contracts imported as `@atlas/shared` |
| `e2e/` | Playwright smoke test against local fakes, `pnpm e2e` |
| `deploy/` | Docker images, VM scripts, Litestream config, `release.sh`, each with a `node:test` beside it |
| `docs/` | `architecture.md`, `deploy.md`, `decisions/` (ADRs), `v<version>/` (PRD, TRD, tasks, plans) |

## Workflow

The current version is **1.1.1**; its plan is `docs/v1.1.1/` (`prd.md` what and why, `trd.md` how, `tasks.md` ordered tasks in checkpoints). Only Naresh edits the PRD and TRD. You edit `tasks.md`, write checkpoint plans and ADRs.

Each session:
1. Read `tasks.md` and say which checkpoint and task is next, in one line. Read the TRD sections and ADRs that task names — not the whole TRD, not every ADR.
2. Plan cell ⬜: enter plan mode, write one plan for the checkpoint (files, tests first, red → green), stop. When approved, save it to `docs/v1.1.1/plans/checkpoint-<x>.md`, tick the cell, commit, push, start.
3. Plan cell ✅: continue from the first unticked task.

Per task: failing test → least code → refactor while green → tick `tasks.md` with a log line → commit → push. Work through a checkpoint without stopping; stop and report at its end.

Not covered by the PRD, TRD, ADRs or the plan (a new dependency, endpoint, job status, contract change, folder)? Stop and ask. When Naresh decides, write the next ADR, add it to `docs/README.md` and the task's ADR column.

**Precedence:** an ADR listed in `tasks.md` beats the TRD (say so in the report); TRD and ADRs beat any `CLAUDE.md` or `architecture.md`; when a task changes what `architecture.md` or a `CLAUDE.md` describes, update it in the same commit. Any other conflict: stop and ask. Never edit the PRD or TRD.

## Rules that span apps

- **TDD, always.** Failing test first, watch it fail for the right reason, least code, refactor green.
- **Contracts live in `packages/shared`.** Neither app redefines a shape the other uses. Exception (ADR 0043): the agent contract is Pydantic-first, mirrored by hand in `packages/shared/src/agent.ts`; a change is one commit across models, JSON Schema export, golden examples and the mirror.
- **Transcription is an HTTP call to Gemini.** The server never downloads video or runs a speech model.
- **The stored transcript is the source of truth.** Markdown and TXT are rendered by pure formatters, never stored.
- **No secrets in the repo.** `.env` stays out of git; `.env.example` names variables only.
- **No new dependency** unless the TRD or an ADR names it. Ask.
- **Database (ADRs 0084, 0085).** Schema 13 is the 1.0 baseline; production is never reset or hand-edited. A schema change is a migration: a new SQL file in `apps/server/src/repositories/sql/` (ADR 0099) and one entry appended to `migrationFiles` in `database.ts`. Never edit, reorder or reformat a locked migration (`migrations.lock.json`) or `SCHEMA_BASE`; fix with a later migration. A new migration needs, written first: a seed `fixtures/schema-<N>.sql`, a test in `database.upgrade.test.ts`, and an `ALLOWED_COUNT_CHANGES` entry if it adds or removes rows. Lock with `pnpm --filter @atlas/server migrations:lock`; `release.sh` refuses an unlocked migration.

## Git

- Work on the release branch named in `tasks.md` (e.g. `release/1.1.1`), never `main`. One commit per task (code, tests, `tasks.md`), pushed after each. Naresh merges `--no-ff`, releases and tags from `main`. No branch is ever named like a tag.
- Conventional commits, no scope: `feat: …`, `fix: …`, `refactor: …`, `docs: …`, `test: …`, `chore: …`. The subject names the change, not the task number; the task id goes in `tasks.md`, not the message.
- Stage files by name. Never `git add -A`/`.`, never commit `.env` or a secret.
- Never `--amend`, rebase, force-push, `reset`, `stash`, `checkout -- <file>` or `restore`. Fix a wrong commit with a new one. If a push fails, stop and report.

## Before you stop

A task is ticked only when `pnpm gate --only <folders it touched>` passes (tests, lint and typecheck for those folders; ADR 0106). At the end of a checkpoint run `pnpm gate` and `pnpm e2e` (needs Docker). `test:integration` is never part of the gate. Report at the end of a checkpoint: what was built per task with hashes; the gate's table and the e2e result; ADRs written and whether they change the TRD; anything deferred.
