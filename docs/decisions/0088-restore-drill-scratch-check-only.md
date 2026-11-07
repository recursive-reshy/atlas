# 0088. The 0.11 restore drill is the scratch check; the new-VM rehearsal is deferred; the soak is waived

- Status: Accepted
- Date: 2026-11-07

## Context
PRD §6.4 and TRD §5–6 ask for two restore procedures to be proved before 1.0 (a scratch check, and restoring onto a new VM) and for one to two weeks of normal use on the VM (the soak) before 1.0 is tagged. Naresh decided on 2026-11-07, outside the PRD and TRD:

- The scratch check passed. The VM rehearsal passed too: upgrade 0.10.0 → 0.11.0 (schema 13 → 14, Status green, one job through); rollback to 0.10.0 with `--restore-pre-migration` (data intact, Replication green); a scratch check after the rollback (`user_version` 13, integrity ok, so Litestream followed the swap); redeploy 0.11.0 (schema 14, Status green, one job through).
- The new-VM rehearsal can't be run safely against the live setup as written. A second VM running the `restore` and `litestream` services writes to the same replica, `gs://<bucket>/atlas.db`, as production and would fork its history. A logged-in Obsidian Sync client on it would push into the real vault.

## Decision
- (a) The restore drill for 0.11 is the **scratch check** only, recorded in `docs/deploy.md`. The new-VM rehearsal is **deferred, not dropped**: it stays in the runbook as the disaster procedure and in `docs/v1-readiness.md` as an unticked item that does not block 1.0.
- (b) The one-to-two-week **soak is waived**. It does not block 1.0. Faults found after 1.0 are fixed as ordinary releases.
- A future new-VM rehearsal must use a separate replica path (its own `litestream.yml`, with a copy of the replica restored there), skip the Obsidian Sync login, and add the rehearsal address to the OAuth client's redirect URIs and to `APP_ORIGINS`.
- The runbook's "A new VM" procedure carries a warning at the top: it is for when the old VM is gone.

## Consequences
- 1.0 can be tagged without a second VM and without waiting, at the cost of the disaster path not having been run end to end. **Still untested:** bootstrap → `restore` service → Obsidian Sync re-download of the vaults on a new VM. Each piece is exercised on its own (bootstrap and the `restore` service on the first deploy, restores by the scratch check, Sync by normal use), but not in one run.
- Changes PRD §6.4 (the drill is the scratch check, and the new-VM drill is deferred) and TRD §5–6 (procedure 2 is not rehearsed in 0.11, the checklist's restore item reads "scratch check passed", and the soak item is waived). The PRD and TRD themselves are left for Naresh to update.

## Alternatives considered
- Rehearsing now against the live replica: unsafe, as above.
- Dropping the new-VM procedure: it is the only documented way back from losing the VM.
- Holding 1.0 for the soak: not needed, given that the rehearsal and the scratch check passed.
