# Atlas v0.11.0 — Release notes

v0.11.0 adds no features. It is the last release allowed to reset the database, and it makes Atlas safe to keep running on real data: from 1.0 every schema change is a forward-only migration (ADR 0084). Nothing about summarizing, linking, reviewing or studying changes.

## New
- **Migrations are locked and upgrade-tested** (ADR 0085). Each released migration's hash is in `migrations.lock.json`; editing or removing one fails a test, and `deploy/release.sh` refuses to build with an unlocked migration. Each locked schema has an invented-data seed (`fixtures/schema-<N>.sql`) and an upgrade test that checks row counts, reads every table back through its repository, and runs integrity and foreign-key checks.
- **Migration 14** renames `transcription_runs.audio_seconds` to `duration_seconds`, which is what it holds now that nothing is downloaded. Schema is 14.
- **`GET /api/health`** now answers `{ ok, version, schema, replication }` (ADR 0086): the version, the database schema, and whether Litestream replication is configured, failing, and when it was last checked.
- **`deploy.sh` preflight, report and history** (ADR 0086). It refuses to deploy while replication is failing, stale or the app doesn't answer (`--force` skips this and says why), prints `Atlas <version> is up, schema <before> → <after>`, and appends each deploy to `/var/lib/atlas/deploys.log`.
- **`deploy.sh <previous> --restore-pre-migration`** rolls back past a migration: it stops the stack, keeps the migrated database as `pre-migration/rolled-back-v<n>-…` and puts the pre-migration copy back. A deploy that fails its health wait is recorded as `unknown`, and the message names the flag.
- **Restore runbook** (ADR 0076). `docs/deploy.md` has a scratch check you can run any time, the new-VM procedure and a point-in-time restore, each with a record table.
- **The 1.0 promise** (ADR 0084): the database is never reset, every change migrates, and [`docs/v1-readiness.md`](../v1-readiness.md) is the checklist.

## Changes
- **Dependencies refreshed** within their majors (ADR 0087): server, shared, web and e2e packages, `@mdxeditor/editor` 4.5, and the agent's lock file.
- **Images pinned by digest.** `node:24-slim`, `python:3.14-slim` and `litestream/litestream:0.5.17` are `tag@sha256:…` everywhere, and a test fails on a tag alone.
- **End of support** (checked 2026-11-07): Node 24 is security-only from 2026-10-20 and ends 2028-04-30; Python 3.14 ends 2030-10-31; Debian 12 (under `node:24-slim`) ends 2028-06-30 and Debian 13 (the agent image) 2030-06-30. Nothing ends before 2027-07.
- **The restore drill for 0.11 is the scratch check only, and the soak is waived** (ADR 0088, changes PRD §6.4 and TRD §5–6). The scratch check passed. The new-VM rehearsal is deferred, not dropped: run as written it would fork the live replica with a second Litestream writer.

## Upgrading from 0.10.0
Only the first upgrade from 0.10.0 is awkward, because 0.10.0's `/api/health` has no `schema` or `replication` fields. The rehearsal on the VM (upgrade, rollback with `--restore-pre-migration`, scratch check, redeploy) passed, and these things happened:
- The installed `/opt/atlas/deploy.sh` (0.10.0) rejects `--force`: `--files` installs the new script only after the options are parsed. Run the checkout's script instead: `sudo ~/atlas-src/deploy/vm/deploy.sh 0.11.0 --files ~/atlas-src --force`.
- `/var/lib/atlas/deploys.log` doesn't exist, so seed it by hand first with `0.10.0 13`; without it the rollback can't find 0.10.0's schema.
- Both 0.11.0 deploys over 0.10.0 needed `--force`, since the preflight can't read the old health body.
- After the rollback, 0.10.0 reported `schema unknown` and wasn't recorded, and the redeploy then printed `schema 14, unchanged` although it migrated 13 → 14. Check `GET /api/health` while 0.10.0 is involved.

The database moves from schema 13 to 14 and a copy goes to `pre-migration/`. None of this applies from 0.11.0 on: `sudo /opt/atlas/deploy.sh <version>` is enough and the report is reliable. Rolling back across 0.11.0 uses `--restore-pre-migration` ([Rolling back](../deploy.md#rolling-back)).

## Deferred
- The new-VM restore rehearsal (ADR 0088); it needs a separate replica path, no Obsidian login, and its address in the OAuth redirect URIs and `APP_ORIGINS`. Still untested: bootstrap → restore → Obsidian re-download on a new VM.
- Dependency majors: `typescript` 7, `ts-fsrs` 6 (check stored card state first), `@anthropic-ai/sdk` 1.x, `jsdom` 31, `@types/node` 26. One per release after 1.0.
- `httpx` is imported by the agent but comes in through `anthropic` and is not a declared dependency.
- The `# syntax=docker/dockerfile:1` line in the Dockerfiles is not pinned by digest.
- Whether Litestream's `sync_count` grows on an idle database is unproven; the preflight never relies on it.

## Known issues
- Only public YouTube videos work; a very long video may be cut short (the transcript is kept and marked).
- Obsidian Headless is in open beta.
