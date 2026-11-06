# 0078. Secrets are fetched from Secret Manager into memory when the stack starts

- Status: Accepted (the secret list changed in ADR 0081: `youtube-api-key` replaces `openai-api-key`)
- Date: 2026-11-02

## Context
On the Mac, secrets live in a git-ignored `.env`. On the VM, a file on disk would be the source of truth for keys that can't be lost or leaked: the Anthropic and OpenAI keys, the agent's shared secret, the Google client secret and the key that encrypts Gmail tokens.

## Decision
- **Secret Manager** in the `atlas` project holds exactly five secrets: `anthropic-api-key`, `openai-api-key`, `agent-secret`, `google-client-secret`, `token-encryption-key`. Obsidian logins are not among them (ADR 0075).
- **At start, a script fetches them** (`fetch-secrets.sh`, run by the `atlas` systemd unit before `docker compose up`) using the VM's service account, and writes them to `/run/atlas/secrets.env`: memory-backed, root-only, gone on reboot. Compose reads it with the plain config file `/etc/atlas/atlas.env`.
- **The app, agent and tests don't change**; they still read environment variables.
- **Rotation** = add a version, restart the unit.
- **Local development** keeps `.env`.

## Consequences
- No secret is on the VM's disk, in an image or in the repo.
- Root on the VM can still read them (as with any option); the VM's access is limited to Tailscale and IAP.
- A missing secret stops the stack from starting, loudly.

## Alternatives considered
- **The app reads Secret Manager itself.** A Google client in both the server and the agent, environment-aware config and fakes in tests, for no gain at this size.
- **`.env` on the VM** with 600 permissions. Simple, but the file becomes the source of truth and outlives reboots.
