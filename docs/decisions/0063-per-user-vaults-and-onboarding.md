# 0063. Per-user vaults under one root, chosen at first sign-in

- Status: Accepted (amended by 0070, 0075)
- Date: 2026-10-24

## Context
Each user has their own Obsidian vault. Today one host folder is mounted at `/vault` (read-write in the app, read-only in the agent), and the agent reads `VAULT_PATH` once at startup. Naresh wants each user to choose their own vault rather than have the admin create it. The server can only see folders mounted into its container: on the Mac in 0.9, on the VM (synced by Obsidian Headless) in 1.0.

## Decision
- **One mount, `/vaults`**, from `VAULTS_HOST_PATH`; each user's vault is `/vaults/<vault_dir>`, where `vault_dir` is a single folder name (lowercase letters, digits, hyphens) stored on `users` and unique.
- **Onboarding:** a signed-in user without a vault must choose one before anything else: claim an existing folder under `/vaults` that no one has claimed, or create a new empty one. Claimed folders are never listed; the unique column and a server-side check stop a forged claim.
- Only the admin can reset a user's vault, after which the user chooses again.
- The server resolves every vault path through `vaultRootFor( user )`; the existing confinement checks apply within it.
- **The agent receives `vault_dir` in `LinkRequest`** and resolves it under `VAULTS_ROOT` with a `realpath` check, answering 422 if it isn't a real folder inside the root. A contract change under ADR 0043.
- Vault work (save, folder picker, linking, Melete scans and generation) is skipped or refused until a vault is chosen.

## Consequences
- Adding a user never touches Compose or `.env`.
- A typed name can't point outside `/vaults`.
- Naresh moves his vault into a parent folder once.
- In 0.9 the brother's vault lives on Naresh's Mac; he can use the app but can't open the notes in his own Obsidian until 1.0, unless Naresh sets up Sync for that folder.
- In 1.0 onboarding is where connecting Obsidian Sync belongs; that needs its own decisions about storing Sync credentials.

## Alternatives considered
- **Admin sets the vault when adding a user:** works, but Naresh wants users to choose their own.
- **Arbitrary paths per user:** each needs its own Compose mount and opens path-escape risks.
- **One shared vault with a folder per user:** both users can read each other's notes in Obsidian.
- **A per-user agent container:** heavier, for no gain while the server is trusted with the shared secret.
