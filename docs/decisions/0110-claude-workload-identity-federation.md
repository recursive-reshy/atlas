# 0110. Claude API credentials: Workload Identity Federation on the VM

- Status: Accepted
- Date: 2026-11-12

## Context
Since 0.10 the Claude API key has been a Secret Manager secret, written to `/run/atlas/secrets.env` at boot and passed to both containers. It never expires; a leak lasts until someone notices and revokes it. Anthropic's Workload Identity Federation (WIF) lets a workload exchange an identity token from its own provider for a Claude API token that expires in minutes. Google Cloud is a supported provider, and the VM runs as the user-managed service account `atlas-vm`, whose identity tokens the metadata server issues.

## Decision
- **On the VM, Express and the agent service use WIF.** Neither container has `ANTHROPIC_API_KEY`. Both read the federation variables (`ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID`, `ANTHROPIC_WORKSPACE_ID`, `ANTHROPIC_IDENTITY_TOKEN_FILE`) and let the SDK exchange and refresh.
- **The Mac keeps an API key** for `pnpm dev`, local Compose and `test:integration`.
- **A host helper supplies the token.** `fetch-identity-token.sh`, run before the stack starts and every 20 minutes by a systemd timer, writes the metadata server's identity token (audience `https://api.anthropic.com`, `format=full`) to `/run/atlas/identity/token`. Both containers mount the folder read-only. A file, not an in-code metadata fetch, because the SDKs' environment path reads the token from a file and one mechanism then serves both services.
- **Exactly one mode per service.** A service refuses to start with both a key and federation, neither, a partial federation setup, or an empty `ANTHROPIC_API_KEY` alongside federation (the SDK treats an empty key as the key path). Compose never names the key as `${…:-}`.
- **One SDK client per process in Express**, with timeouts per request, so tokens are exchanged once and refreshed, not per call.
- **Status shows the source.** A `claude` app health check reports federation or API key for Express; the agent's `/health` reports its own.
- The four IDs live in `/etc/atlas/atlas.env`: they're identifiers, not secrets. `anthropic-api-key` leaves `fetch-secrets.sh`; Naresh revokes the key and deletes the secret once 1.3 is settled.
- WIF is app-level: every user's calls go through the one Anthropic service account. Per-user usage stays in Atlas's own records.

## Consequences
- The VM holds no long-lived Claude credential.
- A rollback to 1.2 after the key is revoked needs a new key in Secret Manager.
- The stack doesn't start if the metadata server can't issue a token.
- Migration 20 adds `claude` to the app health kinds.

## Alternatives considered
- **Fetching the token in code (Python `identity_token_provider`, a TS custom provider):** two mechanisms instead of one file, and the TypeScript SDK's environment path is file-based.
- **A sidecar container for the token:** another image to build and pin for a one-line `curl`; the host already runs `fetch-secrets.sh` the same way.
- **WIF on the Mac too:** no Google identity there; the key stays for local work.
