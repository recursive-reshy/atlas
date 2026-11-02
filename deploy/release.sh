#!/usr/bin/env bash
# Builds the app, agent and sync images for the VM and pushes them to Artifact Registry
# (ADR 0077). Run on the Mac, from a clean checkout of the commit to release:
#
#   deploy/release.sh 0.10.0            build and push
#   deploy/release.sh 0.10.0 --dry-run  print the commands, run none
#
# The version must equal the root package.json's. REGISTRY (<region>-docker.pkg.dev/<project>/<repo>)
# comes from the environment or deploy/release.env (git-ignored; see release.env.example). Docker
# must already be logged in to the registry: gcloud auth configure-docker <region>-docker.pkg.dev
set -euo pipefail

ROOT=${ATLAS_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}

fail() {
  echo "release: $*" >&2
  exit 1
}

version=
dry_run=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=1 ;;
    -*) fail "unknown option $arg" ;;
    *) version=$arg ;;
  esac
done

[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]] || fail "usage: deploy/release.sh <version, like 0.10.0> [--dry-run]"

package_version=$(grep -o '"version": *"[^"]*"' "$ROOT/package.json" | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/')
[ "$package_version" = "$version" ] || fail "package.json is $package_version, not $version; release the version the code says it is"

[ -z "$(git -C "$ROOT" status --porcelain)" ] || fail "the working tree has uncommitted changes; commit them first so the images match a commit"

REGISTRY=${REGISTRY:-}
if [ -z "$REGISTRY" ] && [ -f "$ROOT/deploy/release.env" ]; then
  REGISTRY=$(grep -m 1 '^REGISTRY=' "$ROOT/deploy/release.env" | cut -d= -f2- || true)
fi
[ -n "$REGISTRY" ] || fail "REGISTRY is not set; put it in the environment or deploy/release.env (see release.env.example)"

build() {
  local name=$1 dockerfile=$2 context=$3
  local command=(docker buildx build --platform linux/amd64 -f "$dockerfile" -t "$REGISTRY/$name:$version" --push "$context")
  echo "+ ${command[*]}"
  if [ "$dry_run" = 0 ]; then
    "${command[@]}"
  fi
}

build app "$ROOT/Dockerfile" "$ROOT"
build agent "$ROOT/apps/agent/Dockerfile" "$ROOT/apps/agent"
build sync "$ROOT/deploy/sync/Dockerfile" "$ROOT/deploy/sync"

if [ "$dry_run" = 1 ]; then
  echo "release: dry run, nothing was built or pushed"
else
  echo "release: pushed $REGISTRY/{app,agent,sync}:$version"
fi
echo "Deploy: ssh <vm> sudo /opt/atlas/deploy.sh $version --files <checkout of $version>"
