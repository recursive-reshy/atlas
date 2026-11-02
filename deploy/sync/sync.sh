#!/bin/sh
# Runs Obsidian's headless sync for one vault and tells the app how it is doing (ADR 0075).
#
# `ob sync --continuous` runs in the foreground of this script. When it exits, the last line it
# wrote to stderr is recorded as the error and it is started again after a wait that doubles from
# BACKOFF_START to BACKOFF_MAX seconds (a run that stayed up for UPTIME_RESET_SECONDS starts the
# wait over). A heartbeat rewrites the status file every HEARTBEAT_SECONDS, so a dead container
# shows up as a stale one. The file is /status/<VAULT_DIR>.json, written through a temporary file
# and mv so the app never reads half of it; its shape is VaultSyncStatusFile in packages/shared.
set -eu

# Notes must be readable by the agent, which runs as another user
umask 022

VAULT_DIR=${VAULT_DIR:-}
VAULT_PATH=${VAULT_PATH:-/vault}
STATUS_DIR=${STATUS_DIR:-/status}
HEARTBEAT_SECONDS=${HEARTBEAT_SECONDS:-60}
BACKOFF_START=${BACKOFF_START:-10}
BACKOFF_MAX=${BACKOFF_MAX:-300}
UPTIME_RESET_SECONDS=${UPTIME_RESET_SECONDS:-60}

case "$VAULT_DIR" in
  '' | *[!a-z0-9-]*)
    echo "VAULT_DIR must be set to the user's vault folder name (a-z, 0-9 and -)" >&2
    exit 64
    ;;
esac

now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

# Prints $1 as the inside of a JSON string, at most 500 characters
json_string() {
  printf '%s' "$1" | tr -d '\000-\037' | cut -c1-500 | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# write_status STATE SINCE LAST_ERROR, where LAST_ERROR is already JSON (null or a quoted string)
write_status() {
  tmp="$STATUS_DIR/.$VAULT_DIR.json.tmp"
  printf '{"state":"%s","since":"%s","heartbeat_at":"%s","last_error":%s,"cli_version":"%s"}\n' \
    "$1" "$2" "$(now)" "$3" "$CLI_VERSION" >"$tmp"
  mv "$tmp" "$STATUS_DIR/$VAULT_DIR.json"
}

CLI_VERSION=$(ob --version 2>/dev/null | head -n 1 || true)
CLI_VERSION=$(json_string "${CLI_VERSION:-unknown}")

work=$(mktemp -d)
mkfifo "$work/stderr"
ob_pid=
hb_pid=
tee_pid=
sleep_pid=

stop_children() {
  for pid in $ob_pid $hb_pid $tee_pid $sleep_pid; do
    kill "$pid" 2>/dev/null || true
  done
}
trap 'rm -rf "$work"' EXIT
trap 'stop_children; exit 0' TERM INT

write_status starting "$(now)" null

wait_seconds=$BACKOFF_START
while :; do
  # stderr goes to the container log and to a file whose last line becomes the error
  : >"$work/stderr.log"
  tee "$work/stderr.log" <"$work/stderr" >&2 &
  tee_pid=$!
  ob sync --continuous --path "$VAULT_PATH" 2>"$work/stderr" &
  ob_pid=$!

  started=$(date +%s)
  since=$(now)
  write_status running "$since" null
  (
    while :; do
      sleep "$HEARTBEAT_SECONDS"
      write_status running "$since" null
    done
  ) &
  hb_pid=$!

  status=0
  wait "$ob_pid" || status=$?
  # KILL, not TERM: a TERM that arrives while the subshell is still starting is held back by the
  # inherited trap and then lost, and ob can fail the moment it starts
  kill -KILL "$hb_pid" 2>/dev/null || true
  wait "$hb_pid" 2>/dev/null || true
  wait "$tee_pid" 2>/dev/null || true
  ob_pid=
  hb_pid=
  tee_pid=

  last=$(tail -n 1 "$work/stderr.log" | tr -d '\r')
  [ -n "$last" ] || last="ob exited with status $status"
  write_status failed "$since" "\"$(json_string "$last")\""

  if [ $(( $(date +%s) - started )) -ge "$UPTIME_RESET_SECONDS" ]; then
    wait_seconds=$BACKOFF_START
  fi
  # In the background so a stop signal does not wait out the whole backoff
  sleep "$wait_seconds" &
  sleep_pid=$!
  wait "$sleep_pid" || true
  sleep_pid=
  wait_seconds=$(( wait_seconds * 2 ))
  [ "$wait_seconds" -le "$BACKOFF_MAX" ] || wait_seconds=$BACKOFF_MAX
done
