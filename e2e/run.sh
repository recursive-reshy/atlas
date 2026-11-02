#!/usr/bin/env bash
# Builds and starts the Compose stack against the local fakes, runs the Playwright tests,
# and always tears the stack down with its volume. Needs Docker running. Never touches
# the real instance: own project name, own port (3101), temp vaults folder.
set -euo pipefail

ROOT="$( cd "$( dirname "${BASH_SOURCE[ 0 ]}" )/.." && pwd )"
cd "$ROOT"

PROJECT=atlas-e2e
COMPOSE=( docker compose -p "$PROJECT" --project-directory "$ROOT" -f "$ROOT/docker-compose.yml" -f "$ROOT/e2e/docker-compose.e2e.yml" )

VAULTS_HOST_PATH="$( mktemp -d )"
# One vault per e2e user; the specs sign in as these users through the test-only session route
E2E_ADMIN_VAULT="$VAULTS_HOST_PATH/admin"
mkdir "$E2E_ADMIN_VAULT" "$VAULTS_HOST_PATH/member"
AGENT_SECRET="$( openssl rand -hex 32 )"
TOKEN_ENCRYPTION_KEY="$( openssl rand -base64 32 )"
printf '# Existing note\n\nA note that was already in the vault.\n' > "$E2E_ADMIN_VAULT/Existing note.md"
node "$ROOT/e2e/fakes/seedVault.mjs" "$E2E_ADMIN_VAULT"

chmod -R 777 "$VAULTS_HOST_PATH"

export VAULTS_HOST_PATH AGENT_SECRET TOKEN_ENCRYPTION_KEY
export ANTHROPIC_API_KEY=e2e

cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans || true
  rm -rf "$VAULTS_HOST_PATH"
}
trap cleanup EXIT

"${COMPOSE[@]}" up -d --build --wait

cd e2e
pnpm exec playwright install chromium
E2E_VAULT_DIR="$E2E_ADMIN_VAULT" pnpm exec playwright test
