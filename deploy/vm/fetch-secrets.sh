#!/usr/bin/env bash
# Writes the five secrets from Secret Manager to /run/atlas/secrets.env for Compose (ADR 0078).
#
# Run by the atlas systemd unit before the stack starts, as root, using the VM's service account.
# Uses gcloud when it is installed; otherwise asks the metadata server for a token and calls the
# Secret Manager REST API with curl. All or nothing: the file is written to a temporary name and
# moved into place only when every secret was read, so a missing one stops the stack from starting
# and leaves nothing half-written. No value is ever printed.
#
# Each line is KEY='value'. Compose reads single-quoted values literally (no $ interpolation, no
# comment handling), which is why a value containing ' or a line break is refused. Control
# characters are refused too (ADR 0078): an ESC in an OpenAI key once reached the Authorization header.
set -euo pipefail
umask 077

OUT=${SECRETS_ENV_FILE:-/run/atlas/secrets.env}
METADATA=${METADATA_URL:-http://metadata.google.internal/computeMetadata/v1}
API=${SECRET_MANAGER_URL:-https://secretmanager.googleapis.com/v1}

# secret name in Secret Manager : variable the stack reads
SECRETS=(
  'anthropic-api-key:ANTHROPIC_API_KEY'
  'openai-api-key:OPENAI_API_KEY'
  'agent-secret:AGENT_SECRET'
  'google-client-secret:GOOGLE_CLIENT_SECRET'
  'token-encryption-key:TOKEN_ENCRYPTION_KEY'
)

fail() {
  echo "fetch-secrets: $*" >&2
  exit 1
}

dir=$(dirname "$OUT")
mkdir -p "$dir"
chmod 700 "$dir"
tmp=$(mktemp "$dir/.secrets.XXXXXX")
trap 'rm -f "$tmp"' EXIT

metadata() {
  curl -fsS -H 'Metadata-Flavor: Google' "$METADATA/$1"
}

token=
project=
read_secret() {
  local name=$1
  if command -v gcloud >/dev/null 2>&1; then
    gcloud secrets versions access latest --secret="$name" ${GCP_PROJECT:+--project="$GCP_PROJECT"}
    return
  fi
  if [ -z "$token" ]; then
    token=$(metadata instance/service-accounts/default/token | tr -d '\n\r ' | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
    [ -n "$token" ] || return 1
    project=${GCP_PROJECT:-$(metadata project/project-id)}
  fi
  local body
  body=$(curl -fsS -H "Authorization: Bearer $token" "$API/projects/$project/secrets/$name/versions/latest:access") || return 1
  printf '%s' "$body" | tr -d '\n\r ' | sed -n 's/.*"data":"\([^"]*\)".*/\1/p' | base64 -d
}

for entry in "${SECRETS[@]}"; do
  name=${entry%%:*}
  variable=${entry#*:}
  value=$(read_secret "$name" 2>/dev/null) || fail "could not read secret '$name' (is it created, and can the VM's service account access it?)"
  # Trailing whitespace (a newline typed or piped in) is trimmed; anything else that is not plain
  # text (a control character such as ESC from a paste, or leading whitespace) is refused, because
  # it would reach an Authorization header or a key unchanged.
  value=${value%"${value##*[![:space:]]}"}
  [ -n "$value" ] || fail "secret '$name' is empty"
  cleaned=$(printf '%s' "$value" | LC_ALL=C tr -d '\000-\037\177')
  [ "$cleaned" = "$value" ] || fail "secret '$name' contains a control character; add the secret again without it (pipe the value through: tr -d '\\000-\\037\\177')"
  case "$value" in
    [[:space:]]*) fail "secret '$name' starts with whitespace; add the secret again without it" ;;
  esac
  case "$value" in
    *"'"* | *$'\n'* | *$'\r'*) fail "secret '$name' contains a quote or a line break, which the env file cannot hold" ;;
  esac
  printf "%s='%s'\n" "$variable" "$value" >>"$tmp"
done

chmod 600 "$tmp"
mv "$tmp" "$OUT"
trap - EXIT
echo "fetch-secrets: wrote ${#SECRETS[@]} secrets to $OUT"
