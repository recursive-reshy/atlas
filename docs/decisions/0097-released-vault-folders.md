# 0097. A released vault folder is moved aside, so no one else can claim it

- Status: Accepted
- Date: 2026-11-10

## Context
Deleting a user or resetting their vault (ADR 0070) clears the database's claim on a folder, and the folder stays under `VAULTS_PATH`. `listUnclaimedVaults` offers every folder nobody has claimed, so the other user can pick it on the vault page and read the first user's notes.

## Decision
- After the database change succeeds, `deleteUserAccount` and `resetVault` rename `VAULTS_PATH/<vault_dir>` to `VAULTS_PATH/.released/<vault_dir>-<YYYYMMDDTHHmmss>` (UTC), in the same request. `.released/` is created on first use. A name that already exists gets a numeric suffix.
- `VaultDir` refuses a leading dot, so `listUnclaimedVaults` never lists `.released/` and no one can claim from it.
- The admin gives a folder back by moving it out of `.released/` by hand (`docs/deploy.md`).
- If the rename fails, or the folder is already gone, the request still succeeds. A failure is logged at `error` with the folder name.

## Consequences
- Follows TRD §3.2; it does not change the TRD.
- Disk is not reclaimed automatically; released folders accumulate until the admin removes them.
- Reset used to leave the folder where it was so the same person could choose it again. They now need the admin to move it back.
- The rename keeps the folder's owner and mode, so the VM's UID rule is unchanged.

## Alternatives considered
- **Delete the folder:** loses notes; the vault is the user's data.
- **Record a per-folder owner in the database and refuse other users:** a migration and a new rule for a rare event, when moving the folder removes the offer entirely.
