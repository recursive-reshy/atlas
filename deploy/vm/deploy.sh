#!/usr/bin/env bash
# Switches Atlas on this VM to a released version (ADR 0077). Run as root:
#
#   sudo /opt/atlas/deploy.sh 0.10.1                     pull that version and restart
#   sudo /opt/atlas/deploy.sh 0.10.1 --files <checkout>  also install that checkout's Compose files,
#                                                         scripts and unit first
#   sudo /opt/atlas/deploy.sh 0.10.1 --dry-run           print what it would do, change nothing
#
# Reads the secrets, pulls the images for the version (nothing is changed if a pull fails), sets
# ATLAS_VERSION in /etc/atlas/atlas.env, restarts the atlas unit, and waits up to three minutes for
# the app's health check. Rollback is the same command with the previous version, which is printed.
#
# ATLAS_ETC, ATLAS_OPT, ATLAS_RUN, ATLAS_UNIT, HEALTH_URL, HEALTH_TIMEOUT and HEALTH_INTERVAL move
# the paths and timings for the test.
set -euo pipefail

ETC=${ATLAS_ETC:-/etc/atlas}
OPT=${ATLAS_OPT:-/opt/atlas}
RUN=${ATLAS_RUN:-/run/atlas}
UNIT=${ATLAS_UNIT:-/etc/systemd/system/atlas.service}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:3100/api/health}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-180}
HEALTH_INTERVAL=${HEALTH_INTERVAL:-5}

fail() {
  echo "deploy: $*" >&2
  exit 1
}

version=
files=
dry_run=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=1 ;;
    --files)
      [ $# -ge 2 ] || fail "--files needs a folder"
      files=$2
      shift
      ;;
    -*) fail "unknown option $1" ;;
    *) version=$1 ;;
  esac
  shift
done

[ "$(id -u)" = "0" ] || fail "run this as root (sudo)"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]] || fail "usage: deploy.sh <version, like 0.10.1> [--files <checkout>] [--dry-run]"
[ -f "$ETC/atlas.env" ] || fail "$ETC/atlas.env not found; run bootstrap.sh first"
[ -z "$files" ] || [ -d "$files" ] || fail "$files is not a folder"

previous=$(grep -m 1 '^ATLAS_VERSION=' "$ETC/atlas.env" | cut -d= -f2- || true)
previous=${previous:-unknown}

compose=(docker compose --project-directory "$OPT" --env-file "$ETC/atlas.env" --env-file "$RUN/secrets.env" -f docker-compose.yml -f compose.prod.yml)

# step DESCRIPTION COMMAND...: prints it, runs it unless this is a dry run
step() {
  local description=$1
  shift
  echo "+ $description"
  if [ "$dry_run" = 0 ]; then
    "$@"
  fi
}

# install_from SOURCE DEST MODE: replaces the file through a new inode, so a script that is
# running (this one) is not rewritten under itself. Returns 0 when the content changed.
install_from() {
  local src=$1 dest=$2 mode=$3
  [ -f "$src" ] || fail "$src not found in the checkout"
  if [ -f "$dest" ] && cmp -s "$src" "$dest"; then
    chmod "$mode" "$dest"
    return 1
  fi
  cp "$src" "$dest.new"
  chmod "$mode" "$dest.new"
  mv "$dest.new" "$dest"
}

install_files() {
  install_from "$files/docker-compose.yml" "$OPT/docker-compose.yml" 644 || true
  install_from "$files/compose.prod.yml" "$OPT/compose.prod.yml" 644 || true
  install_from "$files/deploy/litestream/litestream.yml" "$OPT/litestream.yml" 644 || true
  install_from "$files/deploy/vm/fetch-secrets.sh" "$OPT/fetch-secrets.sh" 755 || true
  install_from "$files/deploy/vm/deploy.sh" "$OPT/deploy.sh" 755 || true
  if install_from "$files/deploy/vm/atlas.service" "$UNIT" 644; then
    systemctl daemon-reload
  fi
}

set_version() {
  local tmp
  tmp=$(mktemp)
  awk -v version="$version" '
    /^ATLAS_VERSION=/ { print "ATLAS_VERSION=" version; found = 1; next }
    { print }
    END { if (!found) print "ATLAS_VERSION=" version }
  ' "$ETC/atlas.env" >"$tmp"
  cat "$tmp" >"$ETC/atlas.env" # same file, so its owner and mode stay
  rm -f "$tmp"
}

wait_for_health() {
  local attempts=$((HEALTH_TIMEOUT / HEALTH_INTERVAL)) code i
  [ "$attempts" -ge 1 ] || attempts=1
  for ((i = 1; i <= attempts; i++)); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || true)
    if [ "$code" = "200" ]; then
      return 0
    fi
    [ "$i" -lt "$attempts" ] && sleep "$HEALTH_INTERVAL"
  done
  return 1
}

[ -z "$files" ] || step "install files from $files into $OPT" install_files
step "read the secrets" env "SECRETS_ENV_FILE=$RUN/secrets.env" "$OPT/fetch-secrets.sh"
step "pull the $version images" env "ATLAS_VERSION=$version" "${compose[@]}" pull
step "set ATLAS_VERSION=$version in $ETC/atlas.env" set_version
step "systemctl restart atlas" systemctl restart atlas

if [ "$dry_run" = 1 ]; then
  echo "deploy: dry run, nothing was changed"
  exit 0
fi

echo "deploy: waiting for $HEALTH_URL (up to ${HEALTH_TIMEOUT}s)"
if wait_for_health; then
  "${compose[@]}" ps
  echo "Atlas $version is up (previous version was $previous; to go back: $OPT/deploy.sh $previous)"
else
  "${compose[@]}" ps >&2 || true
  "${compose[@]}" logs --tail 40 app >&2 || true
  echo "deploy: Atlas $version did not become healthy within ${HEALTH_TIMEOUT}s; to go back: $OPT/deploy.sh $previous" >&2
  exit 1
fi
