# Backups and restore

Atlas has no backup button any more. On the VM, [Litestream](https://litestream.io) copies the database to a Cloud Storage bucket within about a second of every change, takes a snapshot every day and keeps seven days of history (ADR 0076). The vaults are not in the bucket: Obsidian Sync holds them.

- **What to do when the VM is lost:** build a new one and deploy; the database comes back by itself. See [Restoring the database](deploy.md#restoring-the-database).
- **What to do for an earlier point in time:** the same section, "an earlier point in time".
- **What is in the replica:** everything in `atlas.db`: jobs and drafts, prompt profiles, settings, feeds, Gmail sources and the encrypted Gmail tokens, usage and cost records, Melete questions and reviews, and users. It is useless without `TOKEN_ENCRYPTION_KEY`, which is kept in Secret Manager and never in the bucket.
- **Before an upgrade changes the database's structure,** the app copies the file to a `pre-migration/` folder next to it (`/srv/atlas/data/pre-migration/` on the VM).
- **On the Mac,** where Docker runs without Litestream, there is no replica. The database is in the `atlas_data` Docker volume; copy it out yourself if you care about it.

Check that replication works in Settings → Sources, on the **Replication** row (admin only): it fails when Litestream reports sync errors, and shows the time of the last sync it saw.
