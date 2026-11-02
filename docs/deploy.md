# Deploying Atlas on a Google Cloud VM

This is the runbook for the hosted setup (ADRs 0075–0078): one small Debian VM runs the app, the vault agent, Litestream and one Obsidian Sync client per synced user. The database is replicated to a Cloud Storage bucket, vaults come from Obsidian Sync, images come from Artifact Registry and secrets from Secret Manager. People reach the app over Tailscale only; the VM accepts nothing from the internet.

Everything here is **yours to run**. Claude Code writes and fixes the scripts and this page but never runs a command that creates, changes or costs anything in Google Cloud, Tailscale or Obsidian. Every `gcloud` command below sits under a **You run:** label for that reason. Paste the output of anything that fails back to Claude Code and it will fix the step on this page.

Checked against vendor documentation on 2026-11-02 (Docker's and Tailscale's Debian installs, Litestream 0.5.17's configuration, Obsidian Headless 0.0.14). Menu and flag names change; if one no longer matches, trust the vendor and fix this page.

## Overview

| Piece | Where it lives | Set up in |
| --- | --- | --- |
| VM `atlas` (e2-small, Debian, 20 GB disk) | Compute Engine, `asia-southeast1` | [1](#1-google-cloud-resources), [2](#2-bootstrap-the-vm) |
| Images `app`, `agent`, `sync` | Artifact Registry repository `atlas` | [1](#1-google-cloud-resources), [first deploy](#5-first-deploy) |
| Five secrets | Secret Manager | [1](#1-google-cloud-resources) |
| Database replica | Cloud Storage bucket | [1](#1-google-cloud-resources) |
| Private address | Tailscale | [3](#3-tailscale) |
| Vault files | Obsidian Sync → `/srv/atlas/vaults/<person>` | [6](#6-obsidian-sync-login-per-person) |

On the VM, files live in these places:

| Path | What |
| --- | --- |
| `/opt/atlas` | Compose files, `litestream.yml`, `fetch-secrets.sh`, `deploy.sh` (installed by bootstrap and deploy) |
| `/etc/atlas/atlas.env` | Settings (no secrets), edited by you; never overwritten by a script |
| `/run/atlas/secrets.env` | Secrets, fetched at start into memory; gone on reboot |
| `/srv/atlas/data` | The database (`atlas.db`) and, in `pre-migration/`, copies made before an upgrade changes its schema |
| `/srv/atlas/vaults/<person>` | One vault per person, kept current by their sync client |

Several steps run Compose by hand. This function (put it in your shell on the VM) saves retyping the arguments the `atlas` service uses:

```sh
dc() {
  sudo docker compose --project-directory /opt/atlas \
    --env-file /etc/atlas/atlas.env --env-file /run/atlas/secrets.env \
    -f docker-compose.yml -f compose.prod.yml "$@"
}
```

## Costs

The fixed costs are the VM, its disk and its external IPv4 address; the bucket and the registry cost pennies at this size. This page does not copy prices, because they are Google's and change. Before you create anything, price these in the [Google Cloud pricing calculator](https://cloud.google.com/products/calculator) or on Google's price lists, for region `asia-southeast1` (Singapore), and write the total next to your project:

- Compute Engine VM: `e2-small` on demand (and `e2-medium`, in case you resize).
- Persistent disk: Balanced, 20 GB.
- External IPv4 address: in use, standard (ephemeral).
- Cloud Storage: Standard storage for a few hundred MB, and the operations Litestream makes (it writes about once a second while the app is changing the database).
- Artifact Registry: storage for three images (a few hundred MB per version) and the egress to the VM, which is in the same region.
- Secret Manager: five secrets, a few accesses a day.

## 1. Google Cloud resources

Pick a project ID (globally unique; below it is `PROJECT_ID`) and a billing account. All commands below use these variables; set them in each new shell.

**You run:**

```sh
export PROJECT_ID=atlas-REPLACE-ME          # lowercase letters, digits and hyphens
export BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX # gcloud billing accounts list
export REGION=asia-southeast1
export ZONE=asia-southeast1-b               # any zone in the region with capacity
export BUCKET=${PROJECT_ID}-atlas-db
export SA_EMAIL=atlas-vm@${PROJECT_ID}.iam.gserviceaccount.com

gcloud projects create "$PROJECT_ID" --name=atlas
gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
gcloud config set project "$PROJECT_ID"
gcloud services enable compute.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com storage.googleapis.com iam.googleapis.com iap.googleapis.com
```

The registry, the bucket and the VM's service account (it gets only what it needs, per resource and not project-wide):

**You run:**

```sh
gcloud artifacts repositories create atlas --repository-format=docker --location="$REGION"

gcloud storage buckets create "gs://$BUCKET" --location="$REGION" \
  --default-storage-class=STANDARD --uniform-bucket-level-access --public-access-prevention

gcloud iam service-accounts create atlas-vm --display-name="Atlas VM"

gcloud artifacts repositories add-iam-policy-binding atlas --location="$REGION" \
  --member="serviceAccount:$SA_EMAIL" --role=roles/artifactregistry.reader
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SA_EMAIL" --role=roles/storage.objectAdmin
```

The five secrets. Run this in `bash` (type `bash` first on a Mac, where the default shell is zsh). It asks for the three values you already have and makes the other two; nothing goes into your shell history:

**You run:**

```sh
for name in anthropic-api-key openai-api-key google-client-secret; do
  printf '%s: ' "$name"; read -rs value; echo
  printf '%s' "$value" | gcloud secrets create "$name" --data-file=-
done
printf '%s' "$(openssl rand -hex 32)"    | gcloud secrets create agent-secret --data-file=-
printf '%s' "$(openssl rand -base64 32)" | gcloud secrets create token-encryption-key --data-file=-

for name in anthropic-api-key openai-api-key agent-secret google-client-secret token-encryption-key; do
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:$SA_EMAIL" --role=roles/secretmanager.secretAccessor
done
```

`google-client-secret` comes from the OAuth client you create below. If you don't have it yet, create the other four now and add this one when you have it (`printf '%s' "$value" | gcloud secrets create google-client-secret --data-file=-`, then the binding). A value may not contain a single quote or a line break (the secrets file cannot hold them); API keys and the two generated ones never do.

The firewall. The default network allows SSH, RDP and ICMP from anywhere; remove those and allow SSH only from Google's IAP range, as a fallback if Tailscale is down:

**You run:**

```sh
gcloud compute firewall-rules delete default-allow-ssh default-allow-rdp default-allow-icmp --quiet
gcloud compute firewall-rules create allow-iap-ssh --network=default --direction=INGRESS \
  --action=allow --rules=tcp:22 --source-ranges=35.235.240.0/20
```

The VM. List Debian image families and use the newest stable one (`debian-12` or later):

**You run:**

```sh
gcloud compute images list --project=debian-cloud --no-standard-images --filter="family~^debian-[0-9]+$" \
  --format="value(family)" | sort -u

gcloud compute instances create atlas --zone="$ZONE" --machine-type=e2-small \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=20GB --boot-disk-type=pd-balanced \
  --service-account="$SA_EMAIL" --scopes=cloud-platform \
  --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring
```

The VM gets an ephemeral external IP (it needs one to reach the internet) and no inbound rule other than IAP SSH. The service account's roles, not the access scope, limit what it can do.

The OAuth client. Follow [`google-cloud-setup.md`](google-cloud-setup.md) in the `atlas` project, with the Tailscale address from step 3 as the origin. Publish the app **In production** so Gmail refresh tokens don't expire after a week.

## 2. Bootstrap the VM

From the checkout of the release on your Mac, send the files bootstrap installs and connect through IAP:

**You run:**

```sh
git archive --format=tar.gz -o /tmp/atlas-src.tar.gz HEAD docker-compose.yml compose.prod.yml deploy
gcloud compute scp /tmp/atlas-src.tar.gz atlas:~ --zone="$ZONE" --tunnel-through-iap
gcloud compute ssh atlas --zone="$ZONE" --tunnel-through-iap
```

On the VM:

```sh
mkdir -p ~/atlas-src && tar xzf ~/atlas-src.tar.gz -C ~/atlas-src
sudo ~/atlas-src/deploy/vm/bootstrap.sh
```

`bootstrap.sh` installs Docker, the Compose plugin, Tailscale and automatic security updates, adds 2 GB of swap and Docker log rotation, lets Docker pull from Artifact Registry as the VM's service account, creates the folders above (UID 1000 owns them), installs the files into `/opt/atlas` and the `atlas` service, and writes `/etc/atlas/atlas.env` from [`deploy/vm/atlas.env.example`](../deploy/vm/atlas.env.example) if it doesn't exist. It does not start Atlas. It is safe to run again after any change; it never overwrites `atlas.env`. For a vault folder per synced person, run it as `sudo SYNC_USERS="naresh alex" ~/atlas-src/deploy/vm/bootstrap.sh` (the default is `naresh`).

Edit the settings:

```sh
sudo nano /etc/atlas/atlas.env
```

Set `REGISTRY` (`asia-southeast1-docker.pkg.dev/<PROJECT_ID>/atlas`), `ADMIN_EMAIL`, `GOOGLE_CLIENT_ID`, `LITESTREAM_BUCKET` (the bucket name) and `APP_ORIGINS` (the address from the next step). Leave `VAULT_CREATE_ENABLED=false`: a vault folder made in the app would have no sync client behind it.

## 3. Tailscale

On the VM, choose a machine name that reveals nothing (it ends up in public certificate logs; see [`phone-access.md`](phone-access.md)):

```sh
sudo tailscale up --ssh --hostname=<name>   # open the link it prints and approve the machine
sudo tailscale serve --bg 3100
tailscale serve status                       # shows https://<name>.<tailnet>.ts.net
```

In the Tailscale admin console, open the machine's menu and choose **Disable key expiry** (an expired key would cut the VM off). MagicDNS and HTTPS certificates must already be on for the tailnet ([`phone-access.md`](phone-access.md) step 3). **Never run `tailscale funnel`.**

Put the printed address in `APP_ORIGINS` in `/etc/atlas/atlas.env`, and add its two redirect URIs to the Google client ([`google-cloud-setup.md`](google-cloud-setup.md#2-authorized-redirect-uris)). From now on connect with `ssh <name>` (Tailscale SSH) instead of `gcloud compute ssh`.

## 4. Authenticate Docker on your Mac

Your Mac pushes the images, so Docker there needs to log in to the registry once:

**You run:**

```sh
gcloud auth login
gcloud auth configure-docker asia-southeast1-docker.pkg.dev
```

Put the registry name in the git-ignored `deploy/release.env` (copy [`deploy/release.env.example`](../deploy/release.env.example)), or set `REGISTRY` when you run the release script.

## 5. First deploy

On the Mac, build and push 0.10.0 (the commit must be clean and `package.json` must say the same version). `--dry-run` shows the three `docker buildx build` commands without running them:

```sh
deploy/release.sh 0.10.0 --dry-run
deploy/release.sh 0.10.0
```

The images are built for `linux/amd64`, whatever your Mac is, so the first build is slow. Then send the release's files to the VM and deploy it:

**You run:**

```sh
git archive --format=tar.gz -o /tmp/atlas-src.tar.gz HEAD docker-compose.yml compose.prod.yml deploy
gcloud compute scp /tmp/atlas-src.tar.gz atlas:~ --zone="$ZONE" --tunnel-through-iap
```

On the VM (or `ssh <name>` through Tailscale):

```sh
rm -rf ~/atlas-src && mkdir ~/atlas-src && tar xzf ~/atlas-src.tar.gz -C ~/atlas-src
sudo /opt/atlas/deploy.sh 0.10.0 --files ~/atlas-src
```

`deploy.sh` installs the files, reads the secrets, pulls the images (a bad tag changes nothing), sets `ATLAS_VERSION`, restarts the `atlas` service and waits up to three minutes for `http://127.0.0.1:3100/api/health`. On the first start the `restore` service finds no database and no replica and exits; the app creates `atlas.db`, and Litestream starts replicating it. The vault sync client fails until the next step, which is expected.

Open the Tailscale address and sign in with the admin account. Settings → Sources shows the Agent, Transcription and Replication rows; Vault sync is failing until step 6.

## 6. Obsidian Sync login, per person

Each synced person needs an Obsidian Sync subscription and a one-time login by hand on the VM. Nothing Obsidian-related goes into Secret Manager or a file in this repo. The login and the sync state live in the service's own volume (`sync-naresh-config`), so rebuilding the VM means doing this again.

The sync image starts its sync loop by default, so these commands replace the entry point with `ob`. On the VM (the `dc` function from the overview), for the person `naresh`:

```sh
dc run --rm --entrypoint ob sync-naresh login                       # interactive; asks for the 2FA code
dc run --rm --entrypoint ob sync-naresh sync-list-remote            # shows the exact remote vault name
dc run --rm --entrypoint ob sync-naresh sync-setup --vault "<remote vault>" --path /vault --device-name atlas-vm
dc run --rm --entrypoint ob sync-naresh sync-config --path /vault --file-types "" --configs "" --conflict-strategy conflict
dc run --rm --entrypoint ob sync-naresh sync --path /vault          # first download, then it returns
dc restart sync-naresh
```

`--file-types ""` and `--configs ""` keep attachments and Obsidian's settings off the VM; `--conflict-strategy conflict` keeps both copies of a conflicting note. The notes appear in `/srv/atlas/vaults/naresh`, readable by the agent.

Within a minute or two Settings → Sources shows **Vault sync** as OK. Then, in the app, choose the vault (**Choose vault** lists the folder) and the first module works on your real notes. Release check: write a note on the Mac and see it in the VM's folder, and the reverse.

## Deploying a release

On the Mac:

```sh
deploy/release.sh 0.10.1
```

Then, if the Compose files, scripts or unit changed, send the files as in step 5 and run on the VM:

```sh
sudo /opt/atlas/deploy.sh 0.10.1 --files ~/atlas-src
```

If only the app changed, `sudo /opt/atlas/deploy.sh 0.10.1` is enough and keeps the installed files. Both print the previous version when they finish. The app applies its own database migrations at start, after copying the database to `/srv/atlas/data/pre-migration/`.

## Rolling back

```sh
sudo /opt/atlas/deploy.sh <previous version>
```

This works as long as the release didn't change the database schema. The server **refuses to start on a database from a newer version**, so after a release that migrated the database, rolling back means restoring the database from before the migration: use [Restoring the database](#restoring-the-database) with a time just before the deploy (or copy the matching file from `/srv/atlas/data/pre-migration/` over `atlas.db` with the app and Litestream stopped).

## Rotating a secret

Add a version in Secret Manager, then restart the service so it fetches again:

**You run:**

```sh
printf '%s' "$NEW_VALUE" | gcloud secrets versions add anthropic-api-key --data-file=-
```

On the VM:

```sh
sudo systemctl restart atlas
```

Rotating `token-encryption-key` signs everyone out and breaks every stored Gmail connection (they show **Reconnect needed**). Rotating `agent-secret` is harmless.

## Restoring the database

**A new VM, or a lost disk** (automatic): bootstrap it (step 2), edit `atlas.env`, and deploy (step 5). The `restore` service sees there is no `atlas.db` and a replica in the bucket, restores the latest state, and only then starts the app. A VM that still has a database is left alone.

**An earlier point in time** (any moment in the last 7 days; manual). On the VM:

```sh
dc stop app litestream
sudo docker run --rm --user 1000:1000 -e LITESTREAM_BUCKET=<bucket> \
  -v /srv/atlas/data:/data -v /opt/atlas/litestream.yml:/etc/litestream.yml:ro \
  litestream/litestream:0.5.17 restore -timestamp 2026-11-20T10:00:00Z -o /data/restored.db /data/atlas.db
cd /srv/atlas/data
sudo mv atlas.db atlas.db.before-restore
sudo rm -f atlas.db-wal atlas.db-shm
sudo mv restored.db atlas.db
dc start app litestream
```

(The timestamp is UTC.) Then check Settings → Sources: Replication should return to OK after a minute. **This procedure has not been tried yet; release check 7.3 restores into a scratch path from the bucket.** If Litestream needs its local state removed after the swap (`/srv/atlas/data/.atlas.db-litestream`), fix this page.

## Resizing the VM

If the app is killed for memory or swap stays high during a video job, move to `e2-medium`:

**You run:**

```sh
gcloud compute instances stop atlas --zone="$ZONE"
gcloud compute instances set-machine-type atlas --zone="$ZONE" --machine-type=e2-medium
gcloud compute instances start atlas --zone="$ZONE"
```

The `atlas` service starts by itself on boot; the external IP may change, which doesn't matter (Tailscale and IAP find the VM by name).

## Adding a second user

1. In `compose.prod.yml`, copy the `sync-naresh` block, rename it (for example `sync-alex`), change `VAULT_DIR` and the two paths to `alex`, and declare `sync-alex-config` under `volumes:`. Commit it.
2. Re-run bootstrap with `SYNC_USERS="naresh alex"` so `/srv/atlas/vaults/alex` exists with the right owner, then send the new files and deploy with `--files` (steps 2 and 5).
3. Do step 6 for `sync-alex` with their Obsidian account. They need their own Obsidian Sync subscription.
4. Add them in Settings → Admin, share the VM's Tailscale node with them ([`phone-access.md`](phone-access.md#sharing-the-app-with-another-person)), and they choose the `alex` vault when they first sign in.

## Release checks (memory and the rest)

On a first release, run these with a video job in progress and record the results in the release notes:

```sh
sudo docker stats --no-stream      # memory of app, agent, litestream, the sync clients
free -m                            # swap use
```

If a container is OOM-killed (`sudo docker inspect <container> --format '{{.State.OOMKilled}}'`) or swap stays high, resize ([above](#resizing-the-vm)); that is the fix, not a code change. The other checks are in the task list: a note written on the Mac reaches the VM and the reverse, a Melete review from the phone, a restore into a scratch path, and the Mac can sleep with everything still working.

## Day to day

```sh
ssh <name>                          # Tailscale SSH
systemctl status atlas              # the service (it exits after starting the stack, by design)
dc ps                               # containers
dc logs -f --tail 100 app           # app log (JSON lines; a job's ID is on every line about it)
dc logs --tail 50 litestream sync-naresh
```

The Status panel (Settings → Sources) shows the Agent, Transcription, Replication and each person's Vault sync. A failing row shows its last errors.

- **`deploy.sh` says the app didn't become healthy.** The last 40 app log lines are printed; fix the cause (often a missing value in `atlas.env`, which the server names when it refuses to start) and run it again, or roll back.
- **`pull access denied` or `unauthorized` on a pull.** The VM's service account lacks `artifactregistry.reader` on the repository, or `REGISTRY` in `atlas.env` is wrong.
- **`fetch-secrets` names a secret it can't read.** It doesn't exist, has no version, or the service account lacks `secretmanager.secretAccessor` on it.
- **Replication is Failing.** `dc logs litestream` usually shows a bucket permission error (`storage.objectAdmin` on the bucket).
- **Vault sync is Failing.** `dc logs sync-naresh` shows the Obsidian client's last line. After a login problem repeat step 6; the client retries by itself with a growing wait up to five minutes (`dc restart sync-naresh` starts it now).
- **YouTube blocks the VM's address.** Videos may fail with a sign-in or bot error from a data-center address. Articles and feeds are unaffected. This is a known issue of the release; cookies and a proxy are deferred.

## Shutting down the old project

Once you have signed in to the new instance on your phone and your Mac and the release checks have passed, delete the old Google Cloud project's OAuth client and then the project itself. A deleted project can be restored for about 30 days.

**You run:**

```sh
gcloud projects delete OLD_PROJECT_ID
```

Keep the old Mac volume (`docker volume ls`) until you are sure nothing in it is needed; the README says how to remove it.
