# 0085. Released migrations are locked by hash and upgrade-tested from SQL seeds

- Status: Accepted
- Date: 2026-11-07

## Context
The server already migrates forward on startup (`runMigrations`, `user_version`, pre-migration copies). Nothing yet stops a released migration being edited, and nothing tests an upgrade from a populated database. The VM is at stored schema 13. Migrations 11–13 carry leftovers from the OpenAI and PO token work.

## Decision
- **Baseline:** schema 13 is the 1.0 baseline as released. No fold into one baseline and no fresh start. Leftovers are cleaned up by migration 14 (`transcription_runs`: drop `pieces`, rename `audio_seconds` → `duration_seconds`), which is also the dry-run migration for the VM rehearsal.
- **Lock:** `migrations.lock.json` maps each released stored version to the SHA-256 of its migration's source. `migrations:lock` only adds entries. Tests fail on a changed hash or a gap. `release.sh` refuses to build with an unlocked migration.
- **Seeds:** one `fixtures/schema-<N>.sql` of plain `INSERT`s per locked version from 13. Each fills every table with invented data, and tests fail on a missing seed or an empty table. A schema N is rebuilt by running the locked migrations up to N, which is only possible because they never change.
- **Upgrade test:** for each seed, migrate to the latest version and check:
  - row counts, with a per-version allow-list;
  - every row reads back through its repository;
  - the integrity and foreign-key checks pass.

## Consequences
- Fixtures are readable in review and diffable.
- Each release that changes the schema adds a seed for its predecessor's schema (or for its own at lock time).
- Formatting a locked SQL string breaks its hash, intentionally.

## Alternatives considered
- Folding 10–13 into one baseline and stamping the VM: edits released migrations, the thing being banned, and is only safe if the VM's schema matches exactly.
- Committed `.db` snapshots: unreviewable binary files.
- Copies of the VM database: contain personal data and tokens.
- A migration library or SQL files: the runner works. Replacing it is risk without benefit.
