# Deploying Atlas on a Google Cloud VM

This is the runbook for the hosted setup (ADRs 0075–0078): one small Debian VM runs the app, the vault agent, Litestream and one Obsidian Sync client per synced user. The database is replicated to a Cloud Storage bucket, vaults come from Obsidian Sync, images come from Artifact Registry and secrets from Secret Manager. People reach the app over Tailscale only; the VM accepts nothing from the internet.

Everything here is **yours to run**. Claude Code writes and fixes the scripts and this page but never runs a command that creates, changes or costs anything in Google Cloud, Tailscale or Obsidian. Every `gcloud` command below sits under a **You run:** label for that reason. Paste the output of anything that fails back to Claude Code and it will fix the step on this page.

Checked against vendor documentation on 2026-11-02 (Docker's and Tailscale's Debian installs, Litestream 0.5.17's configuration, Obsidian Headless 0.0.14). Menu and flag names change; if one no longer matches, trust the vendor and fix this page.

## Overview

| Piece | Where it lives | Set up in |
| --- | --- | --- |
| VM `atlas` (e2-small, Debian, 20 GB disk) | Compute Engine, `asia-southeast1` | [1](#1-google-cloud-resources), [2](#2-bootstrap-the-vm) |
| Images `app`, `agent`, `sync` | Artifact Registry repository `atlas` | [1](#1-google-cloud-resources), [first deploy](#5-first-deploy) |
| Six secrets | Secret Manager | [1](#1-google-cloud-resources) |
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
    -f /opt/atlas/docker-compose.yml -f /opt/atlas/compose.prod.yml "$@"
}
```

## Costs

The fixed costs are the VM, its disk and its external IPv4 address; the bucket and the registry cost pennies at this size. This page does not copy prices, because they are Google's and change. Before you create anything, price these in the [Google Cloud pricing calculator](https://cloud.google.com/products/calculator) or on Google's price lists, for region `asia-southeast1` (Singapore), and write the total next to your project:

- Compute Engine VM: `e2-small` on demand (and `e2-medium`, in case you resize).
- Persistent disk: Balanced, 20 GB.
- External IPv4 address: in use, standard (ephemeral).
- Cloud Storage: Standard storage for a few hundred MB, and the operations Litestream makes (it writes about once a second while the app is changing the database).
- Gemini (Developer API, paid tier): billed per token, per video (a long video is the expensive case; the Usage table in Settings → Admin shows an estimate per month, and the Google Cloud console has the real figure). Google's price list shows the current rates through 2026-12-31 and double from 2027-01-01. The YouTube Data API call that comes with it is free within its daily quota.
- Artifact Registry: storage for three images (a few hundred MB per version) and the egress to the VM, which is in the same region.
- Secret Manager: six secrets, a few accesses a day.

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
  secretmanager.googleapis.com storage.googleapis.com iam.googleapis.com iap.googleapis.com \
  generativelanguage.googleapis.com youtube.googleapis.com
```

The registry, the bucket and the VM's service account (it gets only what it needs, per resource and not project-wide; it has no Gemini role, because Gemini is reached with an API key, ADR 0083):

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

The YouTube Data API key (it gets a video's title, channel and length before Gemini is asked). Restrict it to that one API so a leaked key can do little else:

**You run:**

```sh
gcloud services api-keys create --display-name=atlas-youtube --api-target=service=youtube.googleapis.com
gcloud services api-keys list --format='value(name,displayName)'     # find the key's name
gcloud services api-keys get-key-string <the name printed above>     # the key itself (starts with AIza)
```

Keep the key string for the next step. If a command name has changed, `gcloud services api-keys --help` lists the current ones.

The Gemini API key (ADR 0083). Vertex AI refused YouTube input from the VM's service account, so Gemini is reached through the Gemini Developer API with a key. This one is made in the console, not with `gcloud`:

1. Open [Google AI Studio](https://aistudio.google.com/apikey) → **Get API key** → **Create API key**, and pick the `atlas` project (import it into AI Studio first if it is not listed).
2. Put the project on a **paid tier** (link the billing account in AI Studio). On the free tier inputs may be used to improve Google's products and YouTube input is capped at 8 hours a day.
3. In the Cloud console (APIs & Services → Credentials) open the key, restrict it to the **Generative Language API**, and copy the key string.

Keep that string for the next step.
The six secrets. Run this in `bash` (type `bash` first on a Mac, where the default shell is zsh). It asks for the four values you already have (the Anthropic key, the YouTube Data API key and the Gemini API key from above, and the Google client secret) and makes the other two; nothing goes into your shell history:

**You run:**

```sh
for name in anthropic-api-key youtube-api-key gemini-api-key google-client-secret; do
  printf '%s: ' "$name"; read -rs value; echo
  printf '%s' "$value" | tr -d '\000-\037\177' | gcloud secrets create "$name" --data-file=-
done
printf '%s' "$(openssl rand -hex 32)"    | tr -d '\000-\037\177' | gcloud secrets create agent-secret --data-file=-
printf '%s' "$(openssl rand -base64 32)" | tr -d '\000-\037\177' | gcloud secrets create token-encryption-key --data-file=-

for name in anthropic-api-key youtube-api-key gemini-api-key agent-secret google-client-secret token-encryption-key; do
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:$SA_EMAIL" --role=roles/secretmanager.secretAccessor
done
```

`google-client-secret` comes from the OAuth client you create below. If you don't have it yet, create the other four now and add this one when you have it (`printf '%s' "$value" | tr -d '\000-\037\177' | gcloud secrets create google-client-secret --data-file=-`, then the binding). A value may not contain a single quote, a line break or any control character (the secrets file cannot hold them, and `fetch-secrets.sh` refuses the value, naming the secret); API keys and the two generated ones never do. The `tr` in each command removes control characters such as the ESC that a paste through `read` can bring along.

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

Set `REGISTRY` (`asia-southeast1-docker.pkg.dev/<PROJECT_ID>/atlas`), `ADMIN_EMAIL`, `GOOGLE_CLIENT_ID`, `LITESTREAM_BUCKET` (the bucket name), `GEMINI_MODEL` (`gemini-3.8-flash`; the current Flash model when you read this) and `APP_ORIGINS` (the address from the next step). Leave `VAULT_CREATE_ENABLED=false`: a vault folder made in the app would have no sync client behind it.

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
sudo /opt/atlas/deploy.sh 0.10.0 --files ~/atlas-src --force
```

There is no app yet to ask about replication, so the first deploy on a new VM needs `--force` (it prints that the check would have stopped). `deploy.sh` installs the files, reads the secrets, pulls the images (a bad tag changes nothing), sets `ATLAS_VERSION`, restarts the `atlas` service and waits up to three minutes for `http://127.0.0.1:3100/api/health`. On the first start the `restore` service finds no database and no replica and exits; the app creates `atlas.db`, and Litestream starts replicating it. The vault sync client fails until the next step, which is expected.

Open the Tailscale address and sign in with the admin account. Settings → Sources shows the Agent, Transcription (Gemini) and Replication rows; Vault sync is failing until step 6.

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

## Upgrading

An upgrade is one command and a short checklist. Every version from 1.0 on keeps your data: the app migrates its own database when it starts, and the pre-migration copy it writes first is what a rollback uses (ADR 0084).

**Before**

- Settings → Sources → Status is all green, and the **Replication** row in particular. `deploy.sh` checks this itself and refuses to start while replication is failing, hasn't been checked for twice `STATUS_CHECK_INTERVAL_MINUTES` (default 2), or the app doesn't answer. `--force` skips the check and prints what it would have stopped on; use it only when you know why.
- Nothing is mid-job that you care about: the stack restarts, and a job that was running is put back and run again.

**The command**

On the Mac:

```sh
deploy/release.sh 0.11.0
```

`release.sh` refuses to build while a migration is unlocked. Then, if the Compose files, scripts or unit changed, send the files as in step 5 and run on the VM:

```sh
sudo /opt/atlas/deploy.sh 0.11.0 --files ~/atlas-src
```

If only the app changed, `sudo /opt/atlas/deploy.sh 0.11.0` is enough and keeps the installed files. `--dry-run` prints the steps and changes nothing.

**The first upgrade from 0.10.0.** The installed 0.10.0 `deploy.sh` doesn't know `--force`, and the 0.10.0 app's health body has no `schema` or `replication` fields, so the new preflight can't read it. For that one upgrade:

- the installed `/opt/atlas/deploy.sh` rejects `--force` (it parses options before `--files` installs the new script), so send the 0.11.0 files and run the checkout's script, not the installed one: `sudo ~/atlas-src/deploy/vm/deploy.sh 0.11.0 --files ~/atlas-src --force`;
- `/var/lib/atlas/deploys.log` doesn't exist yet and the script can't learn the running schema from the old health body, so seed it by hand first: `echo "$(date -u +%FT%TZ) 0.10.0 13" | sudo tee /var/lib/atlas/deploys.log`;
- a deploy over 0.10.0 needs `--force` in both directions, and the report is unreliable while 0.10.0 is involved: after a rollback to 0.10.0 it says `schema unknown`, and redeploying 0.11.0 can say `schema 14, unchanged` though it migrated 13 → 14. Check `GET /api/health` instead. All of this happens only because 0.10.0's health has no schema or replication fields; from 0.11.0 on it doesn't.

**After**

- The last lines read `Atlas 0.11.0 is up, schema 13 → 14` (or `schema 14, unchanged`) and name the command to go back. The same facts are in `GET http://127.0.0.1:3100/api/health` (`version`, `schema`, `replication`), and every healthy deploy adds a line `<UTC time> <version> <schema>` to `/var/lib/atlas/deploys.log`. A deploy that never became healthy is recorded with schema `unknown`.
- Settings → Sources → Status is green again within a couple of minutes (Replication included).
- Put one job through: summarize a short video or article, and save it.

If the app doesn't become healthy within three minutes, `deploy.sh` prints the container status, the app's last log lines and the rollback command. Go to [Rolling back](#rolling-back).

## Rolling back

First see whether the release changed the database: `deploy.sh` printed `schema 13 → 14` when it did, and `/var/lib/atlas/deploys.log` has the schema of every version.

**No migration (same schema).** Deploy the previous version:

```sh
sudo /opt/atlas/deploy.sh <previous version>
```

**After a migration.** The previous version **refuses to start on a database from a newer version**, so a plain redeploy fails its health check. Put back the copy the app made before it migrated:

```sh
sudo /opt/atlas/deploy.sh <previous version> --restore-pre-migration
```

It reads both schemas from `deploys.log` (and refuses if there is no migration to undo), finds the newest `pre-migration-v<from>-to-v<to>-*.db` in `/srv/atlas/data/pre-migration/` (and stops, changing nothing, if there is none), stops the `atlas` service, moves the live database aside as `pre-migration/rolled-back-v<to>-<time>.db` (with its `-wal` and `-shm`), puts the copy in place, and deploys the previous version without the replication check. `--dry-run` shows the sequence.

**Writes made since the upgrade are not in the restored database.** Summaries, reviews and settings changed after the upgrade stay in the `rolled-back-…` file; nothing is deleted. To get something back, open that file with `sqlite3` read-only.

After it finishes, check that Replication goes green within a check or two. Litestream sees a replaced file and starts a new generation; a scratch restore (below) should return the old schema. To go forward again, deploy the new version normally: it migrates the restored database again.

If there is no pre-migration copy, or you need a state from an exact moment, use the point-in-time restore in [Restoring the database](#restoring-the-database).

## Updating a pinned image

Every third-party image is pinned as `tag@sha256:<digest>` (ADR 0087): `node:24-slim` in the three Dockerfiles that use it, `python:3.14-slim` in `apps/agent/Dockerfile`, and Litestream in `compose.prod.yml`. `deploy/images.test.mjs` fails on a `FROM` or `image:` that names a tag alone. The digest is the multi-architecture index, so it works on the Mac and on the VM.

To move one (a security fix in the base image, or a new Litestream version), on your Mac:

```sh
docker buildx imagetools inspect node:24-slim   # the first "Digest:" line is the one to use
```

Replace the digest in every file that names that image (`grep -rn 'node:24-slim' Dockerfile deploy e2e`), keep the tag in front of it, then run `pnpm test` and `pnpm e2e` before releasing. A new Litestream version also changes the `restore` command in "Restoring the database".

## Rotating a secret

Add a version in Secret Manager, then restart the service so it fetches again:

**You run:**

```sh
printf '%s' "$NEW_VALUE" | tr -d '\000-\037\177' | gcloud secrets versions add anthropic-api-key --data-file=-
```

On the VM:

```sh
sudo systemctl restart atlas
```

Rotating `token-encryption-key` signs everyone out and breaks every stored Gmail connection (they show **Reconnect needed**). Rotating `agent-secret` is harmless.

## Restoring the database

Litestream keeps the database in the bucket, a second at a time, with a week of history. A restore loses what had not reached the bucket yet, so expect to lose **seconds to a minute** of writes. There are three procedures: a check that costs nothing and touches nothing, the disaster case, and a restore to an earlier moment. Each of the first two ends in a record table; fill in a row every time you run it.

### Scratch check
Any time. Production is untouched: the copy goes to a temporary folder, is read, and is deleted. On the VM:

```sh
set -a; . /etc/atlas/atlas.env; set +a
mkdir -p /tmp/atlas-restore && sudo chown 1000:1000 /tmp/atlas-restore
date -u +%FT%TZ                      # note the time: the restore point is compared with it
time sudo docker run --rm --user 1000:1000 -e LITESTREAM_BUCKET="$LITESTREAM_BUCKET" \
  -v /tmp/atlas-restore:/restore -v /opt/atlas/litestream.yml:/etc/litestream.yml:ro \
  litestream/litestream:0.5.17@sha256:4b02b9859a6b6b4087d8b8944e15f7e984bd7957cba322bbeee38b0e27b9656a restore -o /restore/atlas.db /data/atlas.db
```

Then read the copy with the app image's `node` (read-only), printing the schema, the newest write and the rows per table:

```sh
sudo docker run --rm --user 1000:1000 --entrypoint node -v /tmp/atlas-restore:/restore:ro \
  "$REGISTRY/app:$ATLAS_VERSION" -e '
const Database = require( "better-sqlite3" )
const db = new Database( "/restore/atlas.db", { readonly: true } )
console.log( "user_version", db.pragma( "user_version", { simple: true } ) )
console.log( "integrity", db.pragma( "integrity_check", { simple: true } ) )
for( const { name } of db.prepare( `select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name` ).all() ) {
  console.log( name.padEnd( 32 ), db.prepare( `select count(*) as n from "${name}"` ).get().n )
}
console.log( "newest job", db.prepare( "select max(created_at) as t from jobs" ).get().t )
'
```

Compare with the live database (`user_version` equals `schema` in `GET /api/health`; the newest job time is within a minute or so of your last write), then clean up: `sudo rm -rf /tmp/atlas-restore`.

| Date | Time taken | Restore point against last write | Result |
| --- | --- | --- | --- |
| 2026-11-07 | | | Passed after a rollback: `user_version` 13, integrity ok (Litestream followed the swap) |

### A new VM
**Warning: this procedure is for when the old VM is gone.** Run while production is up, it starts a second Litestream writer on the same replica (`gs://<bucket>/atlas.db`) and would fork it, and a logged-in Obsidian Sync client would push into the real vault. It has not been rehearsed (the 0.11 drill was the scratch check only, ADR 0088). Both would fork or overwrite real data. A future rehearsal must use a separate replica path (its own `litestream.yml`, with a copy of the replica restored there), skip the Obsidian login in step 4, and have its address added to the OAuth client's redirect URIs and to `APP_ORIGINS`.

The disaster case: the VM or its disk is gone.
1. Create the VM as in [step 1](#1-google-cloud-resources) (same service account, so it can read the bucket) and run `bootstrap.sh` ([step 2](#2-bootstrap-the-vm)). Tailscale is [step 3](#3-tailscale).
2. Secrets come from Secret Manager when the `atlas` service starts, as always; there is nothing to copy. Fill `/etc/atlas/atlas.env` as in step 5.
3. Deploy the version that was running, with `--force` (there is no app to ask about replication) as in [step 5](#5-first-deploy). The `restore` service sees an empty data volume and a replica in the bucket, restores the latest state, and only then starts the app. Watch it with `dc logs restore`.
4. Redo the Obsidian Sync login for each person ([step 6](#6-obsidian-sync-login-per-person)); the vault files come from Obsidian Sync, not the bucket.
5. Check `GET http://127.0.0.1:3100/api/health` (`schema` is what you expect), sign in, run one job, do a Melete review, and see Replication go green in Settings → Sources.
6. Repoint Tailscale to the new VM and carry on. (A rehearsal VM, once there is a safe way to run one, is deleted along with its Tailscale node.)

| Date | Time taken | Restore point against last write | Result |
| --- | --- | --- | --- |
|  |  |  |  |

### An earlier point in time
Any moment in the last 7 days; manual, with production stopped. On the VM:

```sh
dc stop app litestream
sudo docker run --rm --user 1000:1000 -e LITESTREAM_BUCKET=<bucket> \
  -v /srv/atlas/data:/data -v /opt/atlas/litestream.yml:/etc/litestream.yml:ro \
  litestream/litestream:0.5.17@sha256:4b02b9859a6b6b4087d8b8944e15f7e984bd7957cba322bbeee38b0e27b9656a restore -timestamp 2026-11-20T10:00:00Z -o /data/restored.db /data/atlas.db
cd /srv/atlas/data
sudo mv atlas.db atlas.db.before-restore
sudo rm -f atlas.db-wal atlas.db-shm
sudo mv restored.db atlas.db
dc start app litestream
```

(The timestamp is UTC.) Then check Settings → Sources: Replication should return to OK after a minute. Not rehearsed yet. If Litestream needs its local state removed after the swap (`/srv/atlas/data/.atlas.db-litestream`), fix this page.

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

If a container is OOM-killed (`sudo docker inspect <container> --format '{{.State.OOMKilled}}'`) or swap stays high, resize ([above](#resizing-the-vm)); that is the fix, not a code change. The other checks are in the task list: a note written on the Mac reaches the VM and the reverse, a Melete review from the phone, a [scratch check](#scratch-check) of the restore, and the Mac can sleep with everything still working.

## Day to day

```sh
ssh <name>                          # Tailscale SSH
systemctl status atlas              # the service (it exits after starting the stack, by design)
dc ps                               # containers
dc logs -f --tail 100 app           # app log (JSON lines; a job's ID is on every line about it)
dc logs --tail 50 litestream sync-naresh
```

The Status panel (Settings → Sources) shows the Agent, Transcription (Gemini), Replication and each person's Vault sync. A failing row shows its last errors.

- **`deploy.sh` says the app didn't become healthy.** The last 40 app log lines are printed; fix the cause (often a missing value in `atlas.env`, which the server names when it refuses to start) and run it again, or roll back.
- **`pull access denied` or `unauthorized` on a pull.** The VM's service account lacks `artifactregistry.reader` on the repository, or `REGISTRY` in `atlas.env` is wrong.
- **`fetch-secrets` names a secret it can't read.** It doesn't exist, has no version, or the service account lacks `secretmanager.secretAccessor` on it.
- **Replication is Failing.** `dc logs litestream` usually shows a bucket permission error (`storage.objectAdmin` on the bucket).
- **Vault sync is Failing.** `dc logs sync-naresh` shows the Obsidian client's last line. After a login problem repeat step 6; the client retries by itself with a growing wait up to five minutes (`dc restart sync-naresh` starts it now).
- **Transcription (Gemini) is Failing, or a video job fails at transcribing.** Read the row's error or the job's. A 400 "API key not valid" or a 403 means `gemini-api-key` is wrong, was restricted to a different API, or `generativelanguage.googleapis.com` is not enabled for the key's project (the key must belong to a project with billing on); a 404 on the model check means `GEMINI_MODEL` names a model that does not exist; a 429 or 5xx is retried once after ten seconds and then reported. Check the secret reached the container without printing it: `dc exec app sh -c 'test -n "$GEMINI_API_KEY" && echo set'`.
- **"Only public YouTube videos are supported" or "Video not found or not public".** The YouTube Data API says the video is private, unlisted, members-only or gone. Gemini can read only public videos. A 403 from the YouTube Data API itself means the `youtube-api-key` secret is wrong, the API is not enabled, or the key is restricted to a different API.
- **A long video's transcript is marked cut short, or the job fails.** Gemini writes at most about 65,000 tokens and takes roughly 45 minutes of video with audio. A cut-short transcript is kept and says so in the review screen; a video over the limit fails with Gemini's own message. Nothing is split into parts (clipping a YouTube link bills the full audio each time, ADR 0081).

## Upgrading from the OpenAI and yt-dlp build

The first 0.10.0 deploy used OpenAI and yt-dlp with a PO token provider, then Gemini on Vertex AI with the service account. Neither is used any more (ADRs 0081, 0083), so after deploying this release: add `GEMINI_MODEL` to `atlas.env` (and remove `GOOGLE_CLOUD_PROJECT` if you added it), create the `youtube-api-key` and `gemini-api-key` secrets (above) and give the service account access to both. If you granted `roles/aiplatform.user` to the service account, remove it (`gcloud projects remove-iam-policy-binding`), and disable `aiplatform.googleapis.com` if nothing else uses it. Deploy with `--files`; the `atlas` service starts Compose with `--remove-orphans`, so the old `pot-provider` container goes and the database moves to schema 13 (a copy goes to `pre-migration/`; a job that was downloading or converting fails with "Interrupted by upgrade"). Once a video job has worked, disable and then delete the old `openai-api-key` secret (`gcloud secrets versions disable` on each version, later `gcloud secrets delete`) and revoke the key in OpenAI's dashboard. YouTube videos must be public: private, unlisted, members-only and age-restricted ones fail, and so do other video sites.

## Shutting down the old project

Once you have signed in to the new instance on your phone and your Mac and the release checks have passed, delete the old Google Cloud project's OAuth client and then the project itself. A deleted project can be restored for about 30 days.

**You run:**

```sh
gcloud projects delete OLD_PROJECT_ID
```

Keep the old Mac volume (`docker volume ls`) until you are sure nothing in it is needed; the README says how to remove it.
