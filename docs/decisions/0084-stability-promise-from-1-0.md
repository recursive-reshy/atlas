# 0084. From 1.0, the database is never reset

- Status: Accepted
- Date: 2026-11-07

## Context
Every release up to 0.10 could start the database again (ADR 0066's 0.9 baseline, the empty VM in 0.10). Atlas now holds real data on the VM, so a reset costs feeds, the Gmail connection, Melete review history and drafts. 1.0 means a promise that this stops.

## Decision
From 1.0:
- **No resets.** No release resets, recreates or hand-edits the production database. 0.11 is the last release allowed one, and it doesn't use it.
- **Forward-only migrations.** Every schema change is a new migration appended to the list. Released migrations are locked and never edited, reordered or removed (ADR 0085). There are no down migrations.
- **Upgrade tests.** Every migration is tested against a seed of every released schema it can start from (ADR 0085).
- **Rollback by copy.** Undoing an upgrade means the previous images plus the pre-migration copy the server writes before migrating (ADR 0086). Writes made after the upgrade are kept in a rolled-back file, not merged.
- **Supported procedures.** The Upgrading, Rolling back and Restoring the database sections of `docs/deploy.md` are the only supported ways to change the VM. A procedure that changes is rewritten there in the same release.
- **Breaking change** from 1.0 means a release that needs a manual step, or loses data or settings, on upgrade. One of those needs its own ADR and a release-notes heading. It still may not reset the database.

## Consequences
- Every schema change carries more work: a migration, a seed, a test.
- Mistakes in a released migration are fixed by a later one, never by editing it.
- A release can always be undone back to the previous one.

## Alternatives considered
- Down migrations: twice the code to keep right, and SQLite table rebuilds make them lossy. A copy is exact.
- Allowing resets for "small" data: there is no small data once Melete review history exists.
