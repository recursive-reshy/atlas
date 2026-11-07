# 0088. The 0.11 restore drill is the scratch check; the new-VM rehearsal is deferred

- Status: Accepted
- Date: 2026-11-07

## Context
PRD §6.4 and TRD §5–6 ask for two restore procedures to be proved before 1.0: a scratch check, and restoring onto a new VM. The scratch check passed on the VM (the restored copy had integrity ok and schema 13 after the rollback in the rehearsal). The VM rehearsal (deploy → schema 14, rollback → 13 with Replication green, redeploy → 14) also passed.

The new-VM rehearsal can't be run safely against the live setup as written:
- A second VM running the `restore` and `litestream` services would write to the same replica, `gs://<bucket>/atlas.db`, while production is also writing to it. Two writers on one replica corrupt its history.
- A logged-in Obsidian Sync client on that VM would push into the real vault.

## Decision
- For 0.11 the restore drill is the **scratch check** only. It is recorded in `docs/deploy.md`.
- The new-VM rehearsal is **deferred, not dropped**. It stays in the runbook as the disaster procedure and in `docs/v1-readiness.md` as an unticked item that does **not** block 1.0.
- A future rehearsal must use a separate replica path (a different bucket or `path:` in its own `litestream.yml`, with a copy of the replica restored into it) and must skip the Obsidian Sync login.
- The runbook's "A new VM" procedure carries a warning at the top: it is for when the old VM is gone.

## Consequences
- The 1.0 checklist can be completed without a second VM, at the cost of the disaster path not having been exercised end to end. The pieces it uses (the `restore` service, `bootstrap.sh`, secrets from Secret Manager) are each exercised on every deploy or by the scratch check, but not in one run.
- Changes PRD §6.4 (the drill is run once, on the scratch check) and TRD §5 (procedure 2 is not rehearsed in 0.11) and §6 (the checklist item reads "scratch check passed"). The PRD and TRD themselves are left for Naresh to update.

## Alternatives considered
- Rehearsing now against the live replica: unsafe, as above.
- Dropping the new-VM procedure: it is the only documented way back from losing the VM.
