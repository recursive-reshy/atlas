# 1.0 readiness

1.0 is tagged by ticking this list, then running `deploy/release.sh 1.0.0` and `deploy.sh 1.0.0` (no migration). From then on the database is never reset (ADR 0084).

- [x] **Restore: scratch check passed.** The restored copy had integrity ok and schema 13 after the rollback; recorded in [Restoring the database](deploy.md#scratch-check). The drill for 0.11 is the scratch check only (ADR 0088).
- [x] **Upgrade rehearsal passed** (TRD §3.5): deploy 0.11.0 → schema 14, rollback to 0.10.0 with `--restore-pre-migration` → 13 with Replication green, deploy again → 14. Findings and what they mean are in the [task log](v0.11.0/tasks.md) (5.2).
- [ ] **One to two weeks of normal use since the 0.11.0 deploy, with no reset** (the soak). Started on the day of the last 0.11.0 deploy: ____ . Earliest 1.0: one week after that.
- [ ] **All Status rows green** at the end of the soak.
- [ ] **No open fault in `tasks.md`.** Faults found during the soak are added to checkpoint D and fixed first.
- [ ] **New-VM rehearsal (deferred, ADR 0088).** Needs a separate replica path and no Obsidian login ([A new VM](deploy.md#a-new-vm)). It does not block 1.0; it stays here until it has been run.
