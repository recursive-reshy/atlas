#!/usr/bin/env bash
# Switches Atlas on this VM to a released version (ADR 0077). Run as root:
#
#   sudo /opt/atlas/deploy.sh 0.10.1                     pull that version and restart
#   sudo /opt/atlas/deploy.sh 0.10.1 --files <checkout>  also install that checkout's Compose files,
#                                                         scripts and unit first
#   sudo /opt/atlas/deploy.sh 0.10.1 --dry-run           print what it would do, change nothing
#   sudo /opt/atlas/deploy.sh 0.10.1 --force             skip the replication check (ADR 0086)
#   sudo /opt/atlas/deploy.sh 0.10.0 --restore-pre-migration
#                                                         roll back past a migration (below)
#
# First reads /api/health and refuses to go on when replication is failing, has not been checked
# for twice STATUS_CHECK_INTERVAL_MINUTES (atlas.env, default 2), or the app does not answer; the
# very first deploy on a new VM has no app to ask, so it needs --force. Then reads the secrets, pulls the images for the version (nothing is changed if a pull fails), sets
# ATLAS_VERSION in /etc/atlas/atlas.env, restarts the atlas unit, and waits up to three minutes for
# the app's health check. Rollback is the same command with the previous version, which is printed.
#
# --restore-pre-migration is for going back to a version whose schema is older than the running one,
# which would refuse the migrated database. It reads both schemas from the history, finds the copy
# the server made before the migration, stops the stack, moves the live database aside as
# pre-migration/rolled-back-… (writes since the upgrade stay there) and puts the copy back, then
# deploys the version as usual, with no replication check because the app is stopped. Without a
# migration in between, a plain deploy of the previous version is enough.
#
# After a healthy start it prints the version and the schema change, and appends
# "<UTC time> <version> <schema>" to /var/lib/atlas/deploys.log (ADR 0086); the last line of that
# history is the previous version and schema, and a schema change adds --restore-pre-migration to
# the rollback command it prints.
#
# ATLAS_ETC, ATLAS_OPT, ATLAS_RUN, ATLAS_UNIT, ATLAS_DEPLOYS_LOG, HEALTH_URL, HEALTH_TIMEOUT and HEALTH_INTERVAL move
# the paths and timings for the test.
set -euo pipefail

ETC=${ATLAS_ETC:-/etc/atlas}
OPT=${ATLAS_OPT:-/opt/atlas}
RUN=${ATLAS_RUN:-/run/atlas}
UNIT=${ATLAS_UNIT:-/etc/systemd/system/atlas.service}
DEPLOYS_LOG=${ATLAS_DEPLOYS_LOG:-/var/lib/atlas/deploys.log}
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
force=0
restore=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=1 ;;
    --force) force=1 ;;
    --restore-pre-migration) restore=1 ;;
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
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]] || fail "usage: deploy.sh <version, like 0.10.1> [--files <checkout>] [--dry-run] [--force] [--restore-pre-migration]"
[ -f "$ETC/atlas.env" ] || fail "$ETC/atlas.env not found; run bootstrap.sh first"
[ -z "$files" ] || [ -d "$files" ] || fail "$files is not a folder"

previous=$(grep -m 1 '^ATLAS_VERSION=' "$ETC/atlas.env" | cut -d= -f2- || true)
health_body=

compose=(docker compose --project-directory "$OPT" --env-file "$ETC/atlas.env" --env-file "$RUN/secrets.env" -f "$OPT/docker-compose.yml" -f "$OPT/compose.prod.yml")

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

# to_epoch TIMESTAMP: seconds since 1970 for an ISO time like 2026-11-07T10:00:00.000Z
to_epoch() {
  local clean=${1%%.*}
  clean=${clean%Z}
  date -u -d "${clean}Z" +%s 2>/dev/null || date -u -j -f '%Y-%m-%dT%H:%M:%S' "$clean" +%s
}

# json_field BODY NAME: a string or number field of the server's flat health JSON
# (packages/shared health.ts), read by plain text matching
json_field() {
  printf '%s' "$1" | sed -n "s/.*\"$2\":\"\{0,1\}\([^\",}]*\).*/\1/p"
}

# preflight_problem BODY: prints why an upgrade should not start now, or nothing when it is fine.
preflight_problem() {
  local body=$1 checked interval age limit
  if [ -z "$body" ]; then
    echo "the app did not answer at $HEALTH_URL (on the first deploy there is no app to ask)"
    return 0
  fi
  case "$body" in
    *'"configured":true'*) ;;
    *) return 0 ;; # replication is not configured (the Mac): nothing to check
  esac
  if [[ "$body" == *'"failing":true'* ]]; then
    echo "replication is failing, so the bucket may be behind the database (check Settings → Sources → Status)"
    return 0
  fi
  checked=$(json_field "$body" last_checked_at)
  if [ -z "$checked" ] || [ "$checked" = "null" ]; then
    echo "replication has not been checked yet; wait a check interval and try again"
    return 0
  fi
  interval=$(grep -m 1 '^STATUS_CHECK_INTERVAL_MINUTES=' "$ETC/atlas.env" | cut -d= -f2- || true)
  [[ "$interval" =~ ^[0-9]+$ ]] || interval=2
  limit=$((interval * 2 * 60))
  age=$(( $(date -u +%s) - $(to_epoch "$checked") ))
  if [ "$age" -gt "$limit" ]; then
    echo "the last replication check was $((age / 60)) minutes ago (limit $((limit / 60)))"
  fi
}

# last_deploy: the last line of the history, "<time> <version> <schema>", or nothing
last_deploy() {
  [ -s "$DEPLOYS_LOG" ] && tail -n 1 "$DEPLOYS_LOG" || true
}

record_deploy() {
  mkdir -p "$(dirname "$DEPLOYS_LOG")"
  printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >>"$DEPLOYS_LOG"
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

# The history says which schema each version ran. A deploy that never became healthy is recorded
# with an unknown schema, and then the copy is found from the target's schema alone.
restore_from=
restore_to=
restore_lookup() {
  [ -s "$DEPLOYS_LOG" ] || fail "no deploy history at $DEPLOYS_LOG, so the schema of $version is unknown; see 'Restoring the database' in docs/deploy.md"
  restore_from=$(awk -v v="$version" '$2 == v && $3 ~ /^[0-9]+$/ { s = $3 } END { print s }' "$DEPLOYS_LOG")
  [ -n "$restore_from" ] || fail "$version is not in the deploy history ($DEPLOYS_LOG) with a schema; see 'Restoring the database' in docs/deploy.md"
  local running
  running=$(tail -n 1 "$DEPLOYS_LOG" | awk '{ print $3 }')
  if [[ "$running" =~ ^[0-9]+$ ]]; then
    [ "$running" != "$restore_from" ] || fail "$version and the running version use the same schema ($running), so there is no migration to undo; $OPT/deploy.sh $version is enough"
    [ "$restore_from" -lt "$running" ] || fail "$version has a newer schema ($restore_from) than the running one ($running); nothing to restore"
    restore_to=$running
  fi
}

if [ "$restore" = 1 ]; then
  restore_lookup
elif [ "$dry_run" = 1 ]; then
  echo "+ check replication through $HEALTH_URL (--force prints a failure and goes on)"
else
  health_body=$(curl -s --max-time 5 "$HEALTH_URL" || true)
  problem=$(preflight_problem "$health_body")
  if [ -n "$problem" ]; then
    if [ "$force" = 1 ]; then
      echo "deploy: --force given; the preflight would have stopped here: $problem"
    else
      fail "$problem; use --force to deploy anyway"
    fi
  fi
fi

[ -z "$files" ] || step "install files from $files into $OPT" install_files
step "read the secrets" env "SECRETS_ENV_FILE=$RUN/secrets.env" "$OPT/fetch-secrets.sh"

# preMigration runs in the app image against the data volume; -T keeps its output free of a terminal
pre_migration() {
  "${compose[@]}" run --rm -T --no-deps app node dist/src/scripts/preMigration.js "$@"
}

if [ "$restore" = 1 ]; then
  step_name="find the pre-migration copy for schema $restore_from → ${restore_to:-any later schema}"
  if [ "$dry_run" = 1 ]; then
    echo "+ $step_name"
    echo "+ systemctl stop atlas"
    echo "+ swap: move atlas.db aside as pre-migration/rolled-back-…, put the copy in its place"
  else
    echo "+ $step_name"
    copy=$(pre_migration find "$restore_from" ${restore_to:+"$restore_to"} || true)
    [ -n "$copy" ] || fail "no pre-migration copy for schema $restore_from → ${restore_to:-any later schema} in the data volume; nothing was changed. Use the point-in-time restore in 'Restoring the database' in docs/deploy.md"
    echo "deploy: using $copy"
    echo "+ systemctl stop atlas"
    systemctl stop atlas
    echo "+ swap: move atlas.db aside as pre-migration/rolled-back-…, put the copy in its place"
    rolled_back=$(pre_migration swap "$copy") || fail "swapping the database failed; the stack is stopped, see the message above and 'Restoring the database' in docs/deploy.md"
    echo "deploy: the database from before the upgrade is back; the newer one is kept as ${rolled_back:-(none)}"
  fi
fi

step "pull the $version images" env "ATLAS_VERSION=$version" "${compose[@]}" pull
step "set ATLAS_VERSION=$version in $ETC/atlas.env" set_version
step "systemctl restart atlas" systemctl restart atlas

if [ "$dry_run" = 1 ]; then
  echo "deploy: dry run, nothing was changed"
  exit 0
fi

# The history's last line says what ran before; with no history yet, the app that was answering
# before this deploy is recorded first, so a later rollback can find its schema.
last=$(last_deploy)
if [ -n "$last" ]; then
  read -r _ last_version last_schema <<<"$last"
  previous=$last_version
  schema_before=$last_schema
  [[ "$schema_before" =~ ^[0-9]+$ ]] || schema_before=
else
  schema_before=$(json_field "$health_body" schema)
  if [ -n "$previous" ] && [[ "$schema_before" =~ ^[0-9]+$ ]]; then
    record_deploy "$previous" "$schema_before"
  fi
fi

echo "deploy: waiting for $HEALTH_URL (up to ${HEALTH_TIMEOUT}s)"
if wait_for_health; then
  "${compose[@]}" ps
  schema_after=$(json_field "$(curl -s --max-time 5 "$HEALTH_URL" || true)" schema)
  [[ "$schema_after" =~ ^[0-9]+$ ]] || schema_after=
  if [ -z "$schema_after" ]; then
    echo "Atlas $version is up, schema unknown"
  elif [ -z "$schema_before" ]; then
    echo "Atlas $version is up, schema $schema_after"
  elif [ "$schema_before" = "$schema_after" ]; then
    echo "Atlas $version is up, schema $schema_after, unchanged"
  else
    echo "Atlas $version is up, schema $schema_before → $schema_after"
  fi
  [ -z "$schema_after" ] || record_deploy "$version" "$schema_after"
  back="$OPT/deploy.sh $previous"
  if [ -n "$schema_before" ] && [ -n "$schema_after" ] && [ "$schema_after" -gt "$schema_before" ]; then
    back="$back --restore-pre-migration"
  fi
  if [ -n "$previous" ]; then
    echo "Atlas $version is up (previous version was $previous; to go back: $back)"
  else
    echo "Atlas $version is up (previous version was none)"
  fi
else
  "${compose[@]}" ps >&2 || true
  "${compose[@]}" logs --tail 40 app >&2 || true
  record_deploy "$version" unknown
  echo "deploy: Atlas $version did not become healthy within ${HEALTH_TIMEOUT}s" >&2
  if [ -n "$previous" ] && [ "$restore" = 0 ]; then
    echo "deploy: to go back: $OPT/deploy.sh $previous" >&2
    echo "deploy: if the new version migrated the database, the previous one refuses a database from a newer version; then use: $OPT/deploy.sh $previous --restore-pre-migration" >&2
  elif [ -n "$previous" ]; then
    echo "deploy: the database was restored but $version did not start; see the logs above" >&2
  fi
  exit 1
fi
