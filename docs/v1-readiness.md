# 1.0 readiness

1.0 is tagged by ticking this list, then running `deploy/release.sh 1.0.0` and `deploy.sh 1.0.0` (no migration). From then on the database is never reset (ADR 0084). Naresh tags `v0.11.0` and `v1.0.0` himself.

- [x] **Restore: scratch check passed.** After a rollback the restored copy had `user_version` 13 and integrity ok, so Litestream followed the swap; recorded in [Restoring the database](deploy.md#scratch-check). The drill for 0.11 is the scratch check only (ADR 0088).
- [x] **VM rehearsal passed** (TRD §3.5): deploy 0.11.0 → schema 14, rollback to 0.10.0 with `--restore-pre-migration` → 13 with Replication green, deploy again → 14. Findings, all from 0.10.0's health body, are in the [task log](v0.11.0/tasks.md) (5.2) and the [release notes](v0.11.0/release-notes.md#upgrading-from-0100).
- [x] **Soak: waived (ADR 0088).** The one-to-two-week period does not block 1.0.
- [x] **All Status rows green.**
- [x] **No open fault in `tasks.md`.**
- [ ] **New-VM rehearsal (deferred, ADR 0088).** Needs a separate replica path, no Obsidian login, and the rehearsal address in the OAuth redirect URIs and `APP_ORIGINS` ([A new VM](deploy.md#a-new-vm)). It does not block 1.0 and stays here until it has been run. Untested until then: bootstrap → restore → Obsidian re-download on a new VM.
