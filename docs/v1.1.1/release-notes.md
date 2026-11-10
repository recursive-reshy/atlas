# Atlas v1.1.1 — Release notes

v1.1.1 is a hardening and tidy-up release. Nothing a user does changes. What changes is what the server refuses, how fast two screens load, and how the code and the docs are organised. There are no new features.

## Security
- **Fetched URLs are checked** (ADR 0096). Before every request, and again after every redirect, the server resolves the address and refuses loopback, private, link-local and unique-local ranges, including IPv4-mapped IPv6. A job, feed or discovery for such an address fails with "That address can't be fetched".
- **A released vault folder can't be claimed** (ADR 0097). Deleting a user, or resetting their vault, moves the folder to `.released/<folder>-<UTC stamp>` so the vault picker never offers it to the other user. Moving it back is a manual step ([deploy.md](../deploy.md#freeing-a-released-vault-folder)).
- **Ingested text is fenced in prompts.** Article, transcript, note and email text, and a learner's answer, go to Claude inside tags that say it is untrusted, and a closing tag inside the text is rewritten. Each prompt that takes such text carries one sentence saying not to follow instructions in it; the linking agent does the same for the note text.
- **A sign-in cookie with the wrong shape is refused** instead of trusted, and `GET /api/health` answers 404 unless the request comes from a trusted proxy or local peer.

## Structure
- **The web app is grouped by feature** (ADR 0098): `app/`, `lib/` and `features/<feature>/` (jobs, feeds, inbox, Gmail, vault, settings, status, admin, Melete, Themis) replace the folders sorted by file type. Five test files that only checked that a mocked call was made were removed.
- **The jobs service is four files** (`jobs`, `jobLinking`, `jobDraft`, `jobRender`), with imports in one direction.
- **The schema SQL is in files** (ADR 0099): `repositories/sql/baseline.sql` and one file per migration, read at start-up and copied into `dist/` by the build. Every locked hash still verifies.
- **A module is defined once** (ADR 0101): `ModuleId` is the registry. The schema no longer lists the modules, and `app.ts` mounts the module gates from one table, so a new module is one entry plus its routes. See migration 17 below.
- **The docs are lighter**: each `CLAUDE.md` holds rules only, the README is a front door, and `docs/architecture.md` is the one description of how the system works. `docs/roadmap.md` is gone, and a test keeps `.env.example` and `config.ts` in agreement.

## Faster
- **The job list reads no transcripts** and makes one query for run usage and one for link usage, however many jobs it lists, and looks each prompt profile up once.
- **A queued job starts at once** (ADR 0100). The worker and the Melete generator run a pass when work is queued (a submit, a retry, a regenerate, linking, pasted text, enrolling a note, a syllabus request or approval, a scan that queues notes) and poll every 15 seconds as a safety net instead of every second.
- **A response that doesn't match its contract says which field** ("Unexpected response from the server: jobs.0.status: …"), so a drift is readable in the console.

## Changes
- **`GET /api/jobs` omits the draft** (ADR 0102). Each listed job is a `JobListItem`, a `Job` without `note_markdown`; `GET /api/jobs/:id` and every other job response still carry it. The web list never used the field.
- **`user_modules` accepts any module name** and the application validates it: `setModules` refuses an unknown one, and `listModules` ignores a stored name it no longer knows.
- The commit messages of the release are plain conventional commits with no version or task scope.

## Migration
- **Migration 17** (ADR 0101), locked with an invented-data seed and an upgrade test: it rebuilds `user_modules` without the `CHECK` and rebuilds the `eligible_users` view for active members only. The admin's modules are added by the loops' queries from `ModuleId`. No row changes.

## Upgrading from 1.1.0
`sudo /opt/atlas/deploy.sh 1.1.1` is enough. The database goes from schema 16 to 17 and a copy goes to `pre-migration/`; `--restore-pre-migration` rolls back ([Rolling back](../deploy.md#rolling-back)). Nothing needs a backfill. A new user's Obsidian sync block is still a manual edit of `compose.prod.yml`, now written out step by step in [Adding a second user](../deploy.md#adding-a-second-user).

## Deferred
- Two server tests timed out at 5 s under the full parallel run while checkpoint B was being built (`worker/linkJob.test.ts` "sends the vault folder of the job's owner" and `routes/promptProfiles.routes.test.ts` "returns 409 for the last remaining profile"). Both passed alone and in every later full run, including the last, and the cause is still unknown.
- The Python agent folded into the Express server (revisited in 1.2.0).
- Metis writing metrics into Themis, a stored resource list per subject and check-in reminders, as listed for 1.1.0.

## Known issues
- A hand edit, or a concept added, while Map is running on that note can be overwritten by that run's result.
- Relinking a subject moves its past time to the new goal.
- Logging time between midnight and the study-day start hour: the dialog offers the calendar day, which the server may refuse as being in the future; its message is shown and the previous day works.
- Only public YouTube videos work; a very long video may be cut short (the transcript is kept and marked).
- A wake that arrives between a loop's last empty claim and the end of its pass is not acted on until the next poll, at most 15 seconds (ADR 0100).
- Obsidian Headless is in open beta.
