# 0075. Vaults on the VM are synced by Obsidian Headless, one container per user

- Status: Accepted (amends 0063)
- Date: 2026-11-02

## Context
On the Mac, each user's vault is a folder under `VAULTS_HOST_PATH` that Obsidian itself keeps current. On a VM there is no Obsidian app. The app, the agent and Melete all work on plain Markdown files and should keep doing so. Obsidian ships an official headless Sync client (`obsidian-headless`, open beta, Node 22+, needs an Obsidian Sync subscription). Obsidian MCP servers were considered: they either need the desktop app running or read a vault that something else keeps synced, so they don't solve this.

## Decision
- **Our own small image** (`node:24-slim` + a pinned `obsidian-headless`), not a community image, because it holds the user's Obsidian login.
- **One container per synced user** (`sync-<user>`), mounting only that user's folder, with its own volume for login and sync state, running `ob sync --continuous`. Adding a user is one Compose block and a runbook step, no code.
- **Login is a one-time interactive `ob login` and `ob sync-setup` on the VM.** 2FA works and no Obsidian password is stored; nothing Obsidian-related is in Secret Manager. Rebuilding the VM means logging in again.
- **Markdown only:** attachments and Obsidian's settings are excluded (`--file-types ""`, `--configs ""`); conflicts keep both copies (`--conflict-strategy conflict`).
- **Health through a status file:** a start script restarts the client with backoff and writes `<vault_dir>.json` (state, heartbeat, last error) to a shared volume the app reads. The app never gets the Docker socket.
- **Files are owned by UID 1000** (the app's user) and world-readable, so the agent can read them.
- **Onboarding on the VM can't create a new vault folder** (`VAULT_CREATE_ENABLED=false`): a folder without a sync container would never reach Obsidian. Users claim a folder the admin has set up (amends ADR 0063).

## Consequences
- The app's file I/O is unchanged; the vault on the VM is just a folder.
- Depends on an open-beta client; it is pinned and its failures show on the Status panel.
- Each user needs their own Obsidian Sync subscription.
- Images and PDFs in a vault aren't on the VM; the app never reads them.

## Alternatives considered
- **Credentials in Secret Manager with automatic login.** Needs 2FA off and the Obsidian password on the server.
- **One container for all vaults.** Mixes accounts in one process and one config.
- **Git-backed vaults.** Works without a subscription, but conflicts are worse and every device needs a Git plugin.
- **An Obsidian MCP server.** Doesn't move files (see Context).
