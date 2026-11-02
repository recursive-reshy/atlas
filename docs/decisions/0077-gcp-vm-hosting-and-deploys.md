# 0077. Hosting on one GCP VM: Compose files, images from the Mac, a bootstrap script

- Status: Accepted (amends 0060)
- Date: 2026-11-02

## Context
The app must run without Naresh's Mac being awake. Decided while scoping: a single Compute Engine VM, not Cloud Run (long jobs, polling loops and file-synced vaults fit a VM; scaling is vertical); SQLite stays; Tailscale stays as the only way in (ADR 0060), not IAP.

## Decision
- **VM:** one e2-small in `asia-southeast1`, current Debian image, 20 GB balanced disk, 2 GB swap. The VM is disposable: the database comes back from the bucket, vaults from Obsidian Sync, images from the registry. Resize to e2-medium if memory runs short.
- **Network:** outbound internet via an ephemeral external IP; no inbound from the internet. The default allow rules are removed; tcp:22 is open only to Google's IAP range as a fallback. Day-to-day access is Tailscale SSH; the app is published with `tailscale serve` as on the Mac (amends ADR 0060's host, not its approach).
- **Least privilege:** a dedicated `atlas-vm` service account with read access to five named secrets, object access on one bucket and pull access on one registry.
- **Compose in three files:** shared (`docker-compose.yml`), local (`compose.local.yml`), prod (`compose.prod.yml`), so settings live once. `COMPOSE_FILE` keeps plain `docker compose` working on the Mac.
- **Images** for app, agent and sync are built on the Mac for `linux/amd64` and pushed to Artifact Registry, tagged with the version. Deploy = `release.sh` on the Mac, then `deploy.sh` on the VM (pull, restart, wait for health). Rollback = deploy the previous tag.
- **Setup as code, lightly:** `deploy/vm/bootstrap.sh` (idempotent) configures the VM; a runbook lists the `gcloud` commands for the project's resources. No Terraform.
- **A new `atlas` GCP project** holds everything, including a new OAuth client published *In production*; the old project is shut down after the cutover.

## Consequences
- The Mac is a development machine only.
- Fixed hosting cost is the VM, its disk and its IP (priced in the runbook), plus pennies for the bucket and registry.
- Deploys need the Mac and two commands; GitHub Actions can automate the same steps later (needs Workload Identity Federation).

## Alternatives considered
- **Cloud Run.** Scale-to-zero doesn't suit polling loops, long jobs or a synced vault folder without major rework.
- **No external IP + Cloud NAT.** Same result, more cost and setup.
- **Container-Optimized OS.** No package manager for Tailscale or the secrets script.
- **Building on the VM.** The web build doesn't fit comfortably in 2 GB.
- **Terraform.** More than one VM's worth of setup needs.
