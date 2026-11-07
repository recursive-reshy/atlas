# Checkpoint D plan: Phase 5 (rehearsal, drill, release), v0.11.0

## Context
Checkpoints A–C are done. Checkpoint D is the last one: it proves what the earlier ones built, on the VM, and releases 0.11.0. It has two kinds of task:
- **Mine (5.1, 5.4):** docs and doc guard tests. No app code.
- **With Naresh (5.2, 5.3):** commands against the VM, GCP and the bucket. Per `tasks.md`, Claude Code never runs these. I give Naresh the exact commands, he runs them and pastes the output back, and I record it. I stop and wait at each hand-off.

ADRs: 0076 (Litestream, supersedes 0051), 0084 (stability promise), 0086 (deploy, rollback). No new ADR expected. TRD §5, §6, §8, §3.5.

Facts found:
- `docs/deploy.md` "Restoring the database" (line ~351) has the automatic new-VM note and a point-in-time procedure marked "not tried yet", plus an open question about `.atlas.db-litestream` local state after a swap. "Release checks" still says "a restore into a scratch path" is in the task list.
- `docs/README.md` already links `v1-readiness.md`, which doesn't exist yet. Task 5.4 creates it, and I check the link resolves.
- `scripts/deployRunbook.test.mjs` is the guard for the runbook: section headings, flags, named files exist.
- Open from checkpoint B: whether Litestream's `sync_count` grows on an idle database (unproven). The rehearsal watches for it. Also the Replication row going green after the swap rollback.
- `release.sh 0.11.0` needs a clean tree, the migration lock check (14 is locked), `REGISTRY` and Docker logged in to Artifact Registry. All of that is Naresh's Mac.
- Version is already 0.11.0 in every package (task 1.1).

## 5.1 — Restore runbook rewritten (TRD §5)
- **Tests first** (`scripts/deployRunbook.test.mjs`, new test, red first): the "Restoring the database" section must contain a "Scratch check" and a "New VM" subsection, and each must name its record table (date, duration, restore point against last write). Also: the old "has not been tried yet" sentence and the stale "task list" mention in Release checks must be gone or updated.
- **Edit `docs/deploy.md`**:
  - **Scratch check:** `docker run` the pinned Litestream image (`litestream/litestream:0.5.17@sha256:…`, same digest as `compose.prod.yml`) as the VM's service account with `litestream restore -o /tmp/atlas-restore.db gs://<bucket>/atlas.db`. Then open the copy with the app image's `node` (better-sqlite3) and print `user_version` and the row count per table. I'll write this as a short inline script in the runbook, or a small committed helper under `apps/server/src/scripts/` if it needs more than a few lines. Preference: inline `node -e`, no new file.
  - **New VM:** the TRD's steps in order (create VM, `bootstrap.sh`, secrets from Secret Manager, `restore` service fills the empty volume, redo Obsidian Sync logins per user, deploy the running version, check sign-in, a job and a Melete review, delete the VM).
  - Keep the point-in-time procedure as a third, clearly labelled section; keep its note about `.atlas.db-litestream`, to be settled by the drill.
  - Each procedure ends with a **Record** table: date, how long it took, restore point against the last write, result. Empty rows for 5.3 to fill.
  - Say "seconds to a minute" for the loss window (TRD §5).
  - Fix the Release checks paragraph to point at the scratch check.
- Commit `docs(0.11-5.1): restore runbook`. Tick 5.1, log line.

## 5.2 — Release and VM rehearsal (with Naresh)
Claude Code prepares and records; Naresh runs. Before starting, I run root `pnpm test`, lint and typecheck once to confirm main is releasable, and `deploy/release.sh 0.11.0 --dry-run` locally (no network).

Step list I hand to Naresh, one block at a time, waiting for pasted output after each:
1. **Release (Mac):** `deploy/release.sh 0.11.0` (builds and pushes app, agent, sync images). Paste the tail.
2. **Baseline on the VM:** Settings → Sources all green; `cat /var/lib/atlas/deploys.log` (probably absent: 0.10.0 predates it); `curl -s 127.0.0.1:<port>/api/health`. This is the pre-state: version 0.10.0, schema 13.
3. **Deploy 0.11.0:** `deploy.sh 0.11.0`. Expect preflight pass, `schema 13 → 14`, a `pre-migration/pre-migration-v13-to-v14-*.db` file, history entries for 0.10.0 (schema 13) then 0.11.0 (14). If the app answers a health body without the new fields, the preflight stops: use `--force`, and note it as the first-upgrade case (0.10.0 doesn't serve the new health body).
4. **Check:** sign-in, one job through, Status green, Replication green.
5. **Roll back:** `deploy.sh 0.10.0 --restore-pre-migration`. Expect `schema 14 → 13`, `rolled-back-v14-…` files kept, data intact, Replication green within one check interval; then a scratch restore (5.1's procedure) returning schema 13.
6. **Deploy 0.11.0 again** → schema 14, history shows 14 → 13 → 14.
7. **Idle `sync_count`:** after a quiet few minutes, `curl` the Litestream metrics and compare `sync_count` twice; paste. Settles the open point from 3.2.

Recording: I append each step's pasted output to the `tasks.md` log (trimmed to the lines that matter, no secrets), and list any deviation.

Fixes: anything wrong in `deploy.sh`, `bootstrap.sh`, `docs/deploy.md` or the Litestream config found here gets its own test-first fix and commit (`fix(0.11-5.2): …`) before the next step. If a fault touches something no doc covers (new endpoint, flag, dependency), I stop and ask.

Commit `docs(0.11-5.2): rehearsal record` with the log line. Tick 5.2 only when all three states (14, 13, 14) are shown and Replication was green after the rollback.

## 5.3 — Restore drill (with Naresh)
Following only the runbook as rewritten in 5.1, with no extra knowledge from me. Naresh runs, I read his output.
1. **Scratch check** on the VM, production untouched. Fill the record table: date, duration, restore point against the last write, schema and row counts compared with the live database.
2. **New VM:** create a throwaway VM, `bootstrap.sh`, secrets, `restore` service fills the volume, redo a Sync login, deploy 0.11.0, check sign-in, a job and a Melete review, then delete the VM. Time it. Costs a few cents; Tailscale node name must not clash with the real VM (runbook note to add if it isn't there).
3. Every place Naresh had to deviate from the text is a runbook bug: I correct `docs/deploy.md` (test-first where a guard applies) in the same task.
Commit `docs(0.11-5.3): restore drill recorded`. If either drill fails, the task stays 🟨 and I report; nothing is ticked on a partial pass.

## 5.4 — `docs/v1-readiness.md` and release notes (TRD §6, §8)
- **Tests first** (new `scripts/v1Readiness.test.mjs`, or added to `hostingDocs.test.mjs`, whichever already guards docs): `docs/v1-readiness.md` exists with the five checklist items; `docs/v0.11.0/release-notes.md` exists with the TRD §8 headings; `docs/README.md` links both and every relative link in those two files resolves. Red first.
- **`docs/v1-readiness.md`:** the five TRD §6 items, with the drill (both procedures) and the rehearsal ticked and dated from the logs; the soak item, status/faults items unticked, with the soak start date (the day of the 5.2 deploy) and the earliest 1.0 date (one to two weeks later). Final lines: tag by ticking, then `release.sh 1.0.0` and `deploy.sh 1.0.0` (no migration).
- **`docs/v0.11.0/release-notes.md`**, in the style of v0.10.0's: migrations locked and upgrade-tested; migration 14 (`duration_seconds`); `/api/health` fields; `deploy.sh` preflight, report, history, `--restore-pre-migration`; restore runbook; dependency refresh and pinned images (with the end-of-support list from 4.4); the 1.0 promise (ADR 0084); Upgrading section (VM: `deploy.sh 0.11.0`, first run needs `--force` if preflight can't read the old health body); Deferred (majors, `httpx` not a declared dependency, `# syntax=` line unpinned).
- `docs/README.md`: v0.11.0 entry gains the release notes link and moves to "(done)" only when Naresh says the soak has finished (so now: "(released, soaking)").
- Update root `CLAUDE.md` only if something it describes changed (restore procedure wording in the Backups paragraph: unchanged unless the drill finds otherwise).
- Commit `docs(0.11-5.4): v1 readiness and release notes`.

## Checkpoint end
Run root `pnpm test`, lint, typecheck, web `test:browser`, agent tests (`ruff`, `pyright`, `pytest`), `deploy/` tests and `pnpm e2e` (Docker running). Report per root CLAUDE.md "Before you stop": tasks with hashes, results per folder, ADRs (none expected, none change the TRD), and deferred items. Checkpoint D is "done" when both drills and the rehearsal have passed and the soak has started. Faults during the soak become new tasks here.

## Verification
- 5.1 and 5.4: the new guard tests, red then green; `pnpm test` at the root.
- 5.2 and 5.3: only Naresh's pasted VM output counts. Pass criteria are written into each step above (schema 14 → 13 → 14, Replication green, scratch restore at schema 13, new-VM app signs in with data present).
- Whole checkpoint: `pnpm e2e` green.

## Task order and stops
5.1 (docs, mine) → 5.2 (stop and wait for Naresh at each step) → 5.3 (same) → 5.4. Commits are one per task, pushed after each, files staged by name. Co-Authored-By line as in the harness reminder.
