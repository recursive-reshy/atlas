#!/usr/bin/env bash
# Sets up a fresh Debian VM for Atlas (ADR 0077, TRD 8.3). Run as root from a checkout of this
# repository, once after creating the VM and again after any change to it: every step looks
# before it acts, so a second run changes nothing.
#
#   sudo deploy/vm/bootstrap.sh
#
# Installs Docker Engine + Compose, Tailscale and unattended security updates; adds 2 GB of swap
# and Docker log rotation; lets Docker pull from Artifact Registry; creates the folders the
# containers write to; installs the Compose files, scripts and systemd unit into /opt/atlas and
# /etc/systemd/system; and creates /etc/atlas/atlas.env from the example if it is missing (an
# existing one is never touched). It does not start the stack: edit atlas.env, then deploy.
#
# Settings (environment): REGISTRY_HOST (default asia-southeast1-docker.pkg.dev), SYNC_USERS
# (vault folders that get a sync container, default "naresh"). ATLAS_ROOT, ATLAS_SRC and
# OS_RELEASE exist for the test: they move every path under a temp folder.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

R=${ATLAS_ROOT:-}
SRC=${ATLAS_SRC:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}
OS_RELEASE=${OS_RELEASE:-/etc/os-release}
REGISTRY_HOST=${REGISTRY_HOST:-asia-southeast1-docker.pkg.dev}
SYNC_USERS=${SYNC_USERS:-naresh}

if [ "$(id -u)" != "0" ]; then
  echo "bootstrap: run this as root (sudo deploy/vm/bootstrap.sh)" >&2
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

log() {
  echo "bootstrap: $*"
}

# install_file SOURCE DEST MODE: copies when the content differs, always sets the mode.
# Returns 0 when it changed the file, 1 when it was already right.
install_file() {
  local src=$1 dest=$2 mode=$3 changed=1
  mkdir -p "$(dirname "$dest")"
  if ! { [ -f "$dest" ] && cmp -s "$src" "$dest"; }; then
    cp "$src" "$dest"
    changed=0
  fi
  chmod "$mode" "$dest"
  return $changed
}

# put DEST MODE: like install_file, with the content on stdin
put() {
  cat >"$work/put"
  install_file "$work/put" "$1" "$2"
}

# fetch URL DEST MODE
fetch() {
  curl -fsSL "$1" -o "$work/fetch"
  install_file "$work/fetch" "$2" "$3"
}

installed() {
  dpkg -s "$1" >/dev/null 2>&1
}

# shellcheck source=/dev/null
codename=$(. "$OS_RELEASE" && echo "$VERSION_CODENAME")
arch=$(dpkg --print-architecture)

# --- base packages -------------------------------------------------------------------------
missing=()
for pkg in ca-certificates curl gnupg unattended-upgrades; do
  installed "$pkg" || missing+=("$pkg")
done
if [ ${#missing[@]} -gt 0 ]; then
  log "installing ${missing[*]}"
  apt-get update -qq
  apt-get install -y -qq "${missing[@]}"
fi

put "$R/etc/apt/apt.conf.d/20auto-upgrades" 644 <<'CONF' || true
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF

# --- swap (e2-small has 2 GB of memory) ----------------------------------------------------
swapfile="$R/swapfile"
if [ ! -f "$swapfile" ]; then
  log "creating 2 GB of swap"
  fallocate -l 2G "$swapfile"
  chmod 600 "$swapfile"
  mkswap "$swapfile"
fi
chmod 600 "$swapfile"
swapon --show=NAME --noheadings | grep -q swapfile || swapon "$swapfile"
mkdir -p "$R/etc"
touch "$R/etc/fstab"
grep -qxF '/swapfile none swap sw 0 0' "$R/etc/fstab" || echo '/swapfile none swap sw 0 0' >>"$R/etc/fstab"

# --- Docker log rotation, before Docker is installed so its first start has it -------------
docker_was_installed=0
installed docker-ce && docker_was_installed=1
daemon_changed=1
put "$R/etc/docker/daemon.json" 644 <<'JSON' && daemon_changed=0
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON

# --- Docker and Tailscale from their own apt repositories -----------------------------------
repos_changed=1
fetch https://download.docker.com/linux/debian/gpg "$R/etc/apt/keyrings/docker.asc" 644 && repos_changed=0
put "$R/etc/apt/sources.list.d/docker.sources" 644 <<SOURCES && repos_changed=0
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $codename
Components: stable
Architectures: $arch
Signed-By: /etc/apt/keyrings/docker.asc
SOURCES
fetch "https://pkgs.tailscale.com/stable/debian/$codename.noarmor.gpg" "$R/usr/share/keyrings/tailscale-archive-keyring.gpg" 644 && repos_changed=0
fetch "https://pkgs.tailscale.com/stable/debian/$codename.tailscale-keyring.list" "$R/etc/apt/sources.list.d/tailscale.list" 644 && repos_changed=0

packages=()
for pkg in docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin tailscale; do
  installed "$pkg" || packages+=("$pkg")
done
if [ ${#packages[@]} -gt 0 ]; then
  log "installing ${packages[*]}"
  apt-get update -qq
  apt-get install -y -qq "${packages[@]}"
elif [ "$repos_changed" = 0 ]; then
  apt-get update -qq
fi

if [ "$daemon_changed" = 0 ] && [ "$docker_was_installed" = 1 ]; then
  log "Docker's log settings changed; restarting Docker"
  systemctl restart docker
fi

# --- pulling from Artifact Registry ---------------------------------------------------------
if command -v gcloud >/dev/null 2>&1; then
  gcloud auth configure-docker --quiet "$REGISTRY_HOST"
else
  install_file "$SRC/deploy/vm/docker-credential-atlas-gar" "$R/usr/local/bin/docker-credential-atlas-gar" 755 || true
  docker_config="$R/root/.docker/config.json"
  if [ ! -s "$docker_config" ]; then
    mkdir -p "$(dirname "$docker_config")"
    printf '{"credHelpers": {"%s": "atlas-gar"}}\n' "$REGISTRY_HOST" >"$docker_config"
  elif ! grep -q "$REGISTRY_HOST" "$docker_config"; then
    log "warning: $docker_config exists without $REGISTRY_HOST; add {\"credHelpers\": {\"$REGISTRY_HOST\": \"atlas-gar\"}} by hand"
  fi
fi

# --- folders the containers write to (UID 1000 is the app's and the sync client's user) -----
for dir in "$R/srv/atlas" "$R/srv/atlas/vaults" "$R/srv/atlas/data" "$R/srv/atlas/sync-status"; do
  mkdir -p "$dir"
  chmod 755 "$dir"
  chown 1000:1000 "$dir"
done
for user in $SYNC_USERS; do
  case "$user" in
    '' | *[!a-z0-9-]*) echo "bootstrap: SYNC_USERS entry '$user' must use only a-z, 0-9 and -" >&2; exit 1 ;;
  esac
  mkdir -p "$R/srv/atlas/vaults/$user"
  chown 1000:1000 "$R/srv/atlas/vaults/$user"
done

# --- what the systemd unit runs ---------------------------------------------------------------
mkdir -p "$R/etc/atlas" "$R/opt/atlas"
chmod 755 "$R/opt/atlas"
install_file "$SRC/docker-compose.yml" "$R/opt/atlas/docker-compose.yml" 644 || true
install_file "$SRC/compose.prod.yml" "$R/opt/atlas/compose.prod.yml" 644 || true
install_file "$SRC/deploy/litestream/litestream.yml" "$R/opt/atlas/litestream.yml" 644 || true
install_file "$SRC/deploy/vm/fetch-secrets.sh" "$R/opt/atlas/fetch-secrets.sh" 755 || true
# deploy.sh arrives with task 5.6
[ ! -f "$SRC/deploy/vm/deploy.sh" ] || install_file "$SRC/deploy/vm/deploy.sh" "$R/opt/atlas/deploy.sh" 755 || true

if [ ! -f "$R/etc/atlas/atlas.env" ]; then
  log "creating /etc/atlas/atlas.env from the example; edit it before the first deploy"
  cp "$SRC/deploy/vm/atlas.env.example" "$R/etc/atlas/atlas.env"
  chmod 640 "$R/etc/atlas/atlas.env"
fi

if install_file "$SRC/deploy/vm/atlas.service" "$R/etc/systemd/system/atlas.service" 644; then
  systemctl daemon-reload
fi
systemctl is-enabled --quiet atlas || systemctl enable atlas

log "done. Next: tailscale up, edit /etc/atlas/atlas.env, then deploy (docs/deploy.md)"
