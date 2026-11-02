# 0076. Continuous replication with Litestream replaces manual backups

- Status: Accepted (supersedes 0051)
- Date: 2026-11-02

## Context
ADR 0051 gave the admin a **Back up now** button that wrote a checked copy of the database to a host folder. On a VM the host folder is not off the machine, and a manual habit protects nothing between clicks. The database is SQLite in WAL mode (ADR 0012) and stays SQLite.

## Decision
- **Litestream** (pinned 0.5.x, official image) runs as a sidecar in the production Compose file and replicates `atlas.db` to a GCS bucket in `asia-southeast1`, within about a second of each change, with a daily snapshot and **7 days** of history. It authenticates as the VM's service account; no key.
- **A one-shot `restore` service** runs before the app starts with "only if there's no database and a replica exists". On a rebuilt VM it restores by itself; otherwise it does nothing. Both Litestream services run as UID 1000.
- **The app sets `busy_timeout = 5000`** so writes wait out Litestream's brief locks.
- **Retired:** the backup button, service and Status row, `BACKUP_DIR`, `BACKUP_HOST_PATH` and the backups mount. Pre-migration copies (ADR 0066) go to a `pre-migration/` folder next to the database.
- **Replication health** comes from Litestream's metrics on the internal network and shows on the Status panel; an old last-sync time alone is never a failure.
- Vaults are not in the bucket; Obsidian Sync holds them.
- Local Docker and the e2e run don't use Litestream.

## Consequences
- Data loss on a dead VM is at most a few seconds; any point in the last week can be restored.
- Recovery is mostly "build a new VM and deploy".
- A restore must be tested (release checklist), since nothing else exercises it.

## Alternatives considered
- **Keep the button, write to a GCS-mounted folder.** Still manual, still gaps.
- **Persistent-disk snapshots.** Coarser (hours), and they back up the whole disk rather than the one file that matters.
- **Litestream wrapping the app (`replicate -exec`).** Puts Litestream into the app image.
