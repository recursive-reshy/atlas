# Atlas v0.11.0 — Product Requirements

## 1. Summary
v0.11.0 is the last release that may reset the database. It adds no features. It makes Atlas safe to keep running on real data, so that 1.0 can be just a tag and a deploy:
- every schema change from now on is a **forward-only migration** that runs on startup, and that rule is written down and tested;
- a **restore drill** proves the Litestream copy in the bucket brings the app back, following a written runbook;
- **upgrading the VM** is one scripted, documented procedure, including what to do when an upgrade fails;
- the **loose ends** from 0.10 are closed: dependencies refreshed, and anything that breaks during a soak period on the VM fixed;
- a **stability ADR** records the promise 1.0 makes.

How summarizing, linking, reviewing and studying work doesn't change.

## 2. Background
0.10.0 moved Atlas to the GCP VM, with Litestream replicating the database, images from Artifact Registry, `deploy.sh` for deploys and rollbacks, and Gemini transcribing YouTube links. Each release up to now has been allowed a fresh start: 0.9 started from a new baseline (ADR 0066) and the VM started empty.

The server already has most of the machinery for migrations: `runMigrations` applies numbered migrations in one transaction and records `user_version`, an older database is copied to `pre-migration/` before it is migrated, and the server refuses to start on a database from a newer version. What's missing is the promise and the proof: nothing yet stops a release from resetting the database, nothing tests an upgrade from each released schema, and neither a restore nor a failed upgrade has a rehearsed procedure.

Decided while scoping (2026-11-06/07):
- 0.11 is the last fresh start; 1.0 is the commitment that every later change migrates data.
- No new features in 0.11. Themis and the Melete concept layer are v1.1; Metis, the jobs CRM and the idea validator come after.
- The VM's current data is kept. The current schema becomes the 1.0 baseline as it stands. The fresh start is used only if the TRD finds a schema change that can't reasonably be migrated.
- The existing migration runner stays; 0.11 hardens it rather than replacing it.

## 3. Goals
- Upgrading the VM to a new version never loses or resets data, and a failed upgrade can be undone.
- The database can be restored from the bucket onto a new VM, and that has been done at least once by following the runbook.
- An upgrade is one command plus a written checklist, not a remembered sequence.
- Atlas runs on the VM through a soak period with no fault left open.
- The rules 1.0 commits to are written in an ADR and in `CLAUDE.md`, so future releases follow them by default.

## 4. Non-goals
- **No new features** in any module, and no UI changes beyond what a loose end needs.
- **No database reset** unless the TRD shows one is unavoidable (§2).
- **No down migrations.** Undoing an upgrade means restoring the pre-migration copy (§6.3), not running migrations backwards.
- **No CI/CD**, staging VM, uptime alerting or high availability.
- **No second user's sync** (still KIV).
- No change to the hosting choices of 0.10 (VM, SQLite, Litestream, Tailscale, Secret Manager).

## 5. Operator flow
1. **A release that changes the schema.** The release adds the next numbered migration. Tests apply it to a copy of every released schema and check the data survives. A release that doesn't change the schema adds nothing.
2. **Upgrading the VM.** On the Mac, Naresh builds and pushes the version's images as today. On the VM he runs the upgrade script, which:
   - checks replication is current;
   - pulls the new images;
   - restarts the stack, which migrates the database on startup and writes the pre-migration copy;
   - waits for the app to report healthy;
   - prints a short result.
   He then works through the upgrade checklist in the runbook.
3. **A failed upgrade.** If the app doesn't come up healthy, the script stops and tells him what failed. Rolling back is a documented step: deploy the previous tag and put the pre-migration copy back in place, since the previous version refuses the migrated database.
4. **Restore drill.** Following the runbook, Naresh restores the database from the bucket onto a scratch VM (or a scratch path), starts the app against it and checks his data is there. He notes the date and how long it took in the runbook.
5. **Day to day.** Nothing changes for users.

## 6. Features

### 6.1 Forward-only migrations as the rule
As Naresh, I want every schema change after 0.11 to keep my data.
- [ ] The current schema is recorded as the 1.0 baseline. The VM's database is already at it, so no reset is needed.
- [ ] Every later schema change is a new numbered migration appended to the list. Released migrations are never edited, reordered or removed; a test fails if a released migration changes.
- [ ] The "fresh baseline" path (ADR 0066's set-aside of an older database) is kept only for databases older than the 1.0 baseline, and new releases can't add another one.
- [ ] A migration that fails leaves the database as it was (one transaction), the server doesn't start, and the log says which migration failed.
- [ ] The rule is in the root `CLAUDE.md` and in the stability ADR (§6.6), so Claude Code follows it without being told.

### 6.2 Upgrade tests
As Naresh, I want to know an upgrade works before I deploy it.
- [ ] A fixture database is kept for each released schema from the 1.0 baseline on, filled with representative rows for every table (users, jobs, prompt profiles, feeds, Gmail sources, link runs, Melete notes, cards and reviews, health rows).
- [ ] A test migrates each fixture to the latest schema and checks the rows are still there and readable through the repositories.
- [ ] A test checks every migrated fixture passes SQLite's integrity and foreign-key checks.
- [ ] Adding a migration without a fixture for the schema it starts from fails the tests.
- [ ] No test touches the network, GCP or a real vault.

### 6.3 Upgrade procedure and rollback
As Naresh, I want upgrading the VM to be one command and a checklist.
- [ ] One upgrade script on the VM (extending or replacing `deploy.sh`, decided in the TRD) runs the steps in §5.2 and stops with a clear message at the first failure.
- [ ] Before restarting, it checks replication is current, so the bucket has the latest data if the disk is lost mid-upgrade.
- [ ] After restarting, it waits for the app to answer healthy within a time limit (set in the TRD) and reports the version and schema now running.
- [ ] **Rollback:** a documented, scripted step deploys the previous tag and restores the matching pre-migration copy. Rolling back a release that had no migration only redeploys the previous tag.
- [ ] `docs/deploy.md` gets an **Upgrade** section: before, during and after checks, and the rollback.
- [ ] The procedure is used for the 0.11 deploy itself, and once more for a dry-run release with a trivial migration, before 1.0.

### 6.4 Restore drill
As the admin, I want proof the backup works, not just a green Status row.
- [ ] A restore runbook in `docs/` covers restoring onto a new VM after losing the disk, and restoring into a scratch path to check a backup without touching production.
- [ ] Naresh runs the drill once following only the runbook. Anything the runbook got wrong or left out is fixed in it.
- [ ] The runbook records when the drill was last run, how long it took and how much data a restore can lose.
- [ ] Vaults are out of scope: Obsidian Sync is their copy, and the runbook says how a new VM gets them back.

### 6.5 Loose ends from 0.10
As a user, I want what 0.10 shipped to work every time.
- [ ] **No known faults.** As of 2026-11-07 no Status row has failed wrongly and no Gemini transcription has failed on the VM, so 0.11 plans no fixes for either. Anything that goes wrong during the 0.11 soak (§6.6) is fixed in 0.11 before 1.0 is tagged, and recorded in `tasks.md`.
- [ ] **Truncated transcripts:** checked end to end once (review marker and download) as part of the release checks; no change planned.
- [ ] **Dependencies:** app, agent and image dependencies are refreshed to current compatible versions; anything unused after 0.10's removals goes; base images are pinned.
- [ ] All tests, lint, type checks and the e2e smoke test pass.

### 6.6 Stability ADR and the 1.0 checklist
As Naresh, I want the promise 1.0 makes written down.
- [ ] One ADR records:
  - no more database resets;
  - forward-only migrations with upgrade tests;
  - rollback by pre-migration copy;
  - the upgrade and restore runbooks as the supported procedures;
  - what counts as a breaking change from 1.0 on.
- [ ] `docs/` gets a short 1.0 readiness checklist:
  - the restore drill passed;
  - the dry-run upgrade passed;
  - one or two weeks of normal use on the VM with no reset;
  - all Status rows green.
  Tagging 1.0 means ticking it.

## 7. Constraints
- **Data first:** no task may reset, recreate or hand-edit the VM's database.
- **New dependencies** only as named in the TRD.
- **Tests:** no test touches the network, GCP, Gemini, Obsidian or a real vault; the e2e smoke test keeps running against fakes.
- **Logs:** paths and IDs only, never note text or secrets (ADR 0049).
- **No new cloud services** beyond those 0.10 uses.

## 8. Out of scope (KIV)
- Down migrations.
- GitHub Actions building images; a staging VM; uptime alerting.
- The second user's Obsidian Sync.
- An MCP server over the synced vault.
- v1.1: Themis (goals) and the Melete concept layer. Later: Metis, job-alert intake (ADR 0041), the jobs CRM, the business-idea validator.

## 9. Open questions
None. Settled in the TRD (ADRs 0084–0087), 2026-11-07:
1. **Baseline:** schema 13 is the 1.0 baseline as released; no fold, no fresh start. Migration 14 cleans up `transcription_runs` and is the dry-run migration.
2. **Fixtures:** one SQL seed per released schema, with schemas rebuilt from the locked migrations; a lock file of migration hashes.
3. **Upgrade script:** `deploy.sh` is extended; `/api/health` reports version, schema and replication.
4. **Rollback:** `deploy.sh <previous> --restore-pre-migration`; writes after the upgrade stay in a rolled-back file.
5. **Dependencies:** minor and patch only; majors after 1.0, one per release; base images pinned by digest.
6. **Restore drill:** a scratch path on the VM, then once on a throwaway VM.
