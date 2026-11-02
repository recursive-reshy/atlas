# 0051. Manual database backups with SQLite's online backup, to a host folder

- Status: Superseded by 0076
- Date: 2026-10-21

## Context
All of Mnemosyne's state except the vault is one SQLite file (WAL mode) on a Docker volume, with no backup. Copying the file while the app runs could give a torn copy. Naresh wants to back up when he chooses, not on a schedule. The Gmail refresh token in the database is encrypted with `TOKEN_ENCRYPTION_KEY` from `.env`.

## Decision
- **Back up now** in the Status panel calls `POST /api/backups`. There is no schedule.
- The copy uses better-sqlite3's `db.backup()` (SQLite's online backup API): consistent while the app runs, no new dependency.
- It is written as `….partial`, checked with `PRAGMA quick_check` on a read-only open, then renamed to `mnemosyne-YYYYMMDD-HHmmss.db` (Singapore time, no colons).
- Backups go to `BACKUP_HOST_PATH` on the Mac (required in `.env`), mounted at `/backups` in the app container only. The app never deletes a backup.
- One backup at a time; a second request gets 409. Results go through `recordCheck` as the `backup` subject.
- **The encryption key is never written to the backups folder.** The folder may be cloud-synced, and a key beside the encrypted token would undo the encryption.
- The server refuses to start on a database whose `user_version` is higher than its migration count, so restoring a newer backup into older code fails clearly.
- Restore is a documented manual procedure (`docs/backups.md`), not a UI action.

## Consequences
- A copy of everything but the vault and `.env` is one click away; off-machine copies come from where Naresh points the folder.
- Restoring the Gmail connection needs the same `TOKEN_ENCRYPTION_KEY`; without it, Gmail is reconnected and nothing else is lost.
- Old backups pile up until Naresh deletes them.

## Alternatives considered
- **Nightly scheduled backups with rotation:** Naresh prefers manual.
- **`VACUUM INTO`:** also consistent and compacts, but runs synchronously and blocks the worker while it runs.
- **Copying the file and its WAL:** not safe while the app writes.
- **Restore from the UI:** the app would have to swap its own database while running; not worth it for a rare task. KIV.
