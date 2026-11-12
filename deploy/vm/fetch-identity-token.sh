#!/usr/bin/env bash
# Writes the VM's Google identity token for the Anthropic audience to /run/atlas/identity/token (ADR 0110).
#
# Run by atlas.service before the stack starts and every 20 minutes by atlas-identity-token.timer,
# as root. Both containers mount the folder read-only and let the Anthropic SDKs exchange the token
# for a short-lived Claude API token. The token is world-readable on the host: it lives an hour and
# is only useful at Anthropic for the one federation rule. It is never printed.
#
# All or nothing: the answer must be three base64url segments, is written to a temporary file in
# the same folder and moved into place, so a bad answer or a failed call leaves the old token alone
# (and the containers, which read a folder not a file, see the rename). Overridable for tests:
# METADATA_URL, IDENTITY_TOKEN_DIR, IDENTITY_AUDIENCE.
set -euo pipefail
umask 022

METADATA=${METADATA_URL:-http://metadata.google.internal/computeMetadata/v1}
DIR=${IDENTITY_TOKEN_DIR:-/run/atlas/identity}
AUDIENCE=${IDENTITY_AUDIENCE:-https://api.anthropic.com}

fail() {
  echo "fetch-identity-token: $*" >&2
  exit 1
}

mkdir -p "$DIR"
chmod 755 "$DIR"
tmp=$(mktemp "$DIR/.token.XXXXXX")
trap 'rm -f "$tmp"' EXIT

answer=$(curl -fsS -H 'Metadata-Flavor: Google' \
  "$METADATA/instance/service-accounts/default/identity?audience=$AUDIENCE&format=full" 2>/dev/null) \
  || fail "the metadata server did not give an identity token (is this a VM with a service account?)"
# Trailing whitespace is trimmed; anything else that is not a JWT is refused without echoing it
answer=${answer%"${answer##*[![:space:]]}"}
[[ "$answer" =~ ^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]] \
  || fail "the metadata server's answer is not an identity token"

printf '%s' "$answer" >"$tmp"
chmod 644 "$tmp"
mv "$tmp" "$DIR/token"
trap - EXIT
echo "fetch-identity-token: wrote the identity token to $DIR/token"
