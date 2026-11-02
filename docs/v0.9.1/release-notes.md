# Mnemosyne v0.9.1 — Release notes
v0.9.1 is a small patch after 0.9.0's manual testing. It fixes three things: choosing a learning root that doesn't exist yet, one unreadable folder breaking the folder picker and the Melete scan, and "Open in Obsidian" pointing at one vault for everyone. Nothing else changes, and the database schema is the same as 0.9.0.

## New
- **A new learning root can be created from Settings** (ADR 0072). In the learning-root dialog **New folder** now works: saving creates the folder in your vault and sets it as the learning root. A name outside the vault, an invalid name or one a file already has is refused with a message ("A file is in the way of folder …"; this also replaces a server error on the review screen's save). This is the only place Melete's code creates anything in the vault: the scan, generator and review still never write.
- **A folder the app can't read is skipped, logged and shown.**
  - The folder picker leaves out what is inside an unreadable folder instead of failing; the folder itself still shows, empty. The server logs one warning per skipped folder with your user ID, the vault-relative path and the error code.
  - The Melete scan skips an unreadable folder or note and finishes. Notes under it are left exactly as they were: not marked missing, not treated as moved, questions unchanged. A subject folder that can't be entered counts as one skipped path.
  - The Melete page shows a warning that lists the paths the last scan couldn't read (folded behind **Show** past five), and it goes once a scan reads them. The server logs one warning per scan with the paths.
  - A vault whose own root can't be read is still an error, not an empty tree.
- **"Open in Obsidian" opens each person's own vault.** The link uses the person's vault folder name, which is what Obsidian calls a vault opened as a folder. Nothing to set up.

## Changes
- **`OBSIDIAN_VAULT_NAME` is removed.** A leftover line in `.env` is ignored and logged as a warning at startup, like `VAULT_PATH` since 0.9.0. The README, both `.env.example` files and the variables table say so.
- **API.** `GET /api/melete/today` returns `skipped_paths` (a list of vault-relative paths, empty when none or before the first scan). No new endpoints.
- **Skipped paths are kept in memory**, per person and per process, and replaced by each scan that runs. After a restart the notice is empty until the next scan.
- No new dependencies and no database change: the app starts on the 0.9.0 database as it is, and no backup copy is made.

## Upgrading
1. Pull, then `docker compose build` and `docker compose up -d`.
2. Delete the `OBSIDIAN_VAULT_NAME` line from `.env` (a leftover is ignored with a warning).
3. Check it works (with Naresh):
   - In Settings → Melete, choose a learning root with **New folder** and see the folder appear in the vault.
   - `chmod 000` a subfolder of a vault. Open the folder picker (the folder shows with nothing inside, and `docker compose logs` has a warning naming it) and the Melete page (the notice lists it, and notes under it are still reviewable). Then `chmod 755` it back and see the notice clear after the next scan.
   - As both users, **Open in Obsidian** opens the right vault.

## Deferred
- A per-person Obsidian vault name setting, for someone who opens Obsidian at a folder other than their vault folder. A person who opens a parent folder gets a link to a vault Obsidian doesn't know.
- A native folder dialog and Finder-like picker improvements: the picker chooses a folder on the server, which browsers can't do natively, and the server moves in 0.10.0.
- Everything planned for 0.10.0: the cloud move (the GCP VM, obsidian-headless per user, a transcription API in place of whisper-server, Litestream, Secret Manager, yt-dlp cookies and proxy).

## Known issues
- The unreadable-folder cases are tested in unit tests only: the e2e container runs as root, where `chmod` proves nothing, and the permission tests skip themselves under root.
- Known from earlier versions: pages that need JavaScript or a login can't be read; the web bundle is large; costs are estimates from a price table.

## Under the hood
- Server: `isSkippable` and `listFolderTree( …, onSkip )` in `vault.client.ts`; `walkSubject` returning `{ files, skipped }`; `readNote` answering `'gone'` or `'unreadable'`; `applyScan` leaving notes under a skipped path alone; `melete/scanOutcome.ts`; `vaultDirFor( userId )`; `updateSettings` validating the learning root with `resolveFolder`. Web: `MeleteSkippedNotice`. Shared: `GetMeleteTodayResponse.skipped_paths`.
