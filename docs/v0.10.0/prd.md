# Atlas v0.10.0 — Product Requirements

## 1. Summary
v0.10.0 moves the app off Naresh's Mac to a small always-on **Google Cloud VM**, and renames the app to **Atlas**. Atlas is the umbrella; **Mnemosyne** stays the name of the transcriber module, next to **Melete**. On the VM:
- each user's vault is kept current by the official **Obsidian Headless** sync client;
- transcription uses **OpenAI's transcription API** instead of the local whisper-server, which is removed;
- the database is continuously replicated to a **GCS bucket** with **Litestream**, replacing manual backups;
- secrets live in **Secret Manager**, not a `.env` file;
- access stays private over **Tailscale**.

The database starts fresh. How summarizing, linking, reviewing and studying work doesn't change.

## 2. Background
Through 0.9.1 the app runs in Docker on Naresh's Mac, so his phone and his brother can only reach it while the Mac is awake and online (`phone-access.md`). 0.9 made the app multi-user and kept everything Mac-specific in settings, so that this release is a deployment rather than a redesign.

Decided while scoping the cloud move (0.9 PRD §2, and the 0.10 scoping chat):
- **Host:** one Compute Engine VM, e2-small in asia-southeast1, running the Compose stack. Not Cloud Run: long-running jobs, polling loops and file-synced vaults fit a VM, and scaling is vertical. **SQLite** stays; no Postgres.
- **Access:** Tailscale on the VM, with `tailscale serve` as today. Not Identity-Aware Proxy, which needs a paid load balancer.
- **Vaults:** Obsidian Headless (the official headless Sync client), one per user. Naresh will buy an Obsidian Sync subscription. The design serves two users; only Naresh's sync is set up in this release.
- **Transcription:** OpenAI's API with `gpt-transcribe`, its current recommended model. Claude has no speech-to-text, so this is the one non-Anthropic AI key. whisper-server is deleted, not kept as an option. `gpt-transcribe` returns text without timestamps, and the only OpenAI model that gives timestamps (`whisper-1`) shuts down on 2027-02-26; Naresh is fine with video transcripts losing their timestamps and caret sync (the transcript is deleted after save anyway, ADR 0015). Google Chirp 3 (real timestamps, about 3.5× the price) was considered and not chosen.
- **Data:** fresh start on the VM; nothing is copied from the Mac. 1.0 is reserved for when every change migrates data.
- **Backups:** Litestream to GCS; the "Back up now" button (ADR 0051) is retired.
- **Images:** built on the Mac for `linux/amd64`, pushed to Artifact Registry and pulled by the VM. GitHub Actions comes later.
- **Secrets:** Secret Manager.
- **yt-dlp** cookies and proxy for datacenter IPs move to a later release.
- **Name:** Atlas for the app, everything it runs on, the repo and the new GCP project. Mnemosyne for the transcriber module, its locked `mnemosyne` note tag and its default `Mnemosyne` note folder. A new GCP project named `atlas` replaces the current one (a project ID can't be renamed); the old project is shut down after the cutover.

## 3. Goals
- Naresh can review in Melete and submit videos and articles from his phone with the Mac off.
- Notes saved by the app appear in Obsidian on his Mac and phone, and notes he writes there reach the app, through Obsidian Sync.
- Losing the VM loses no more than a few minutes of data, and a documented restore brings it back.
- No secret sits in a file in the repo or on a laptop as the source of truth.
- Deploying a new version is a short, written procedure.
- The fixed monthly hosting cost is small and written down.
- The app, code and cloud resources are called Atlas before any cloud resource is created.

## 4. Non-goals
- **No data migration.** The VM starts with an empty database; the Mac's database is left as it is.
- **No public internet exposure.** No public web address, no Funnel, no load balancer, no domain name.
- **No CI/CD.** No GitHub Actions this release.
- **No yt-dlp workarounds.** If YouTube blocks the VM's address, video jobs fail with a clear error; articles, feeds and Gmail keep working.
- **No second user's sync set up.** The brother's vault, Obsidian account and sync are not configured (the design supports it).
- **No feature changes** to summarizing, linking, review, saving, Melete, sign-in or admin, beyond the transcription source and its cost.
- No high availability, autoscaling, staging environment or uptime alerting.
- No Cloud Run, no Postgres, no IAP.

## 5. User flow
1. **Rename (on the Mac).** Atlas builds, tests and runs locally as before, now named Atlas. The transcriber module shows as **Mnemosyne** in the drawer, and saved notes still carry the `mnemosyne` tag and go to the `Mnemosyne` folder.
2. **One-off setup (Naresh, following the runbook).**
   - Create the `atlas` GCP project.
   - Create its Google sign-in/Gmail OAuth client and the OpenAI API key.
   - Put every secret in Secret Manager.
   - Create the bucket, the registry and the VM; join the VM to the tailnet.
   - Log the VM's Obsidian Headless in to his Obsidian account and his vault.
3. **Deploy.** On the Mac: build the images for amd64 and push them. On the VM (over Tailscale SSH or the console): pull and start. The app comes up at the VM's Tailscale address.
4. **First sign-in.**
   - Naresh opens the Tailscale address on his phone and signs in with Google as the admin.
   - He chooses his vault: the folder Obsidian Headless keeps in sync.
   - He re-adds his feeds, connects Gmail and sets his learning root, as after 0.9's fresh start.
5. **Day to day.**
   - A video is transcribed through OpenAI and summarized. Saving writes the note to the VM's copy of the vault; Obsidian Sync carries it to the Mac and phone within moments.
   - A note written on the Mac reaches the VM's vault the same way, so the linker and Melete see it.
   - The Mac can sleep.
6. **Admin oversight.** The admin's usage view also shows each user's transcription minutes and cost. The Status panel shows the transcription API, the agent, replication and each user's vault sync.
7. **Recovery.** If the VM or its disk is lost, Naresh follows the restore runbook: create a new VM, restore the database from the bucket with Litestream, and let Obsidian Headless re-download the vaults.

## 6. Features

### 6.1 Rename to Atlas
As Naresh, I want the app named Atlas before anything is created in the cloud.
- [ ] **App:** the name is Atlas in the page title, PWA manifest and drawer header, and on the sign-in and "not allowed" pages.
- [ ] **Code and runtime:**
  - workspace packages are `@atlas/shared`, `@atlas/server` and `@atlas/web`; the Python package is `atlas_agent`;
  - Compose services, images and the volume are named `atlas…`; the database file is `atlas.db`; the session cookie is renamed.
- [ ] **Stays Mnemosyne:** the transcriber module's label in the drawer and Settings, the locked `mnemosyne` note tag, and the default `Mnemosyne` note folder. Notes and vaults don't change.
- [ ] **Docs:** the root README, `CLAUDE.md` files and the docs index use Atlas. Past PRDs, TRDs, release notes and ADRs stay as written. One new ADR records the rename and the umbrella/module split.
- [ ] The GitHub repo and the folder on the Mac are renamed by Naresh, as a step in the release checklist.
- [ ] All tests, lint, type checks and the e2e smoke test pass after the rename.

### 6.2 Transcription through OpenAI
As a user, I want videos transcribed without a whisper-server on my machine.
- [ ] **Output:** video jobs are transcribed by OpenAI's `gpt-transcribe` and produce a plain-text transcript, shown and summarized as today.
- [ ] **No timestamps for videos:**
  - video transcripts have no timestamps or timestamp links, like articles;
  - caret sync between transcript and editor goes (ADR 0034 is superseded), and so does the `.srt` download;
  - video notes' key points and quotes no longer end with a link to that moment on YouTube: a video summary has the same shape as an article summary. Notes already in the vault are untouched.
- [ ] **Length and errors:**
  - videos of at least two hours work; audio over the API's upload limit is compressed or split, and the pieces' text joined in order;
  - a transcription failure fails the job with a readable reason, as whisper-server failures do today.
- [ ] **Cost:** each transcription records its audio duration, model and estimated cost against the user. The admin's usage rollup shows transcription alongside summary, linking, Melete and extraction.
- [ ] **Removed:** whisper-server, its client, `WHISPER_URL`, `WHISPER_MODEL`, its Status row and its setup docs. The transcription model is recorded on each transcript, as the whisper model was. ADRs 0002 and 0004 are superseded.
- [ ] **Development and tests:** local development uses the same API. Tests and the e2e run use a fake that never touches the network.

### 6.3 Vaults synced by Obsidian Headless
As a user, I want my vault on the VM to be the same vault I use in Obsidian.
- [ ] Each user with a configured sync has an Obsidian Headless client keeping their vault folder under the vaults root current in both directions. The app, agent and Melete keep reading and writing plain files under that root, as today.
- [ ] Setting up a user's sync is an operator step in the runbook, not something done in the app: a one-time interactive `ob login` and `ob sync-setup` on the VM, so 2FA works and no Obsidian password is stored. The login lives in that user's sync container volume. Adding the second user's sync is the same step again plus one Compose block, with no code change.
- [ ] The VM syncs Markdown only: attachments and Obsidian's own settings are excluded, and conflicts keep both copies rather than merging.
- [ ] A user whose vault isn't synced yet can't pick a vault until a folder exists for them; the onboarding message says to ask the admin.
- [ ] **Status:** the panel shows each sync client as healthy or failing, with the last error, to the admin.
- [ ] **Conflicts:** two edits of the same note on two devices are resolved by Obsidian Sync's own rules; the app doesn't add its own.

### 6.4 Continuous database replication
As the admin, I want the database safe without remembering to back it up.
- [ ] Litestream replicates the database to a GCS bucket continuously, with old snapshots expiring on a schedule (retention set in the TRD).
- [ ] **Restore runbook:** an empty VM is restored from the bucket. It is tested once as part of this release's checklist.
- [ ] **Status:** the panel shows replication health (healthy or failing, time of last successful replication).
- [ ] **Retired:** the "Back up now" button, the backup service, `BACKUP_DIR`, `BACKUP_HOST_PATH` and the backups mount. ADR 0051 is superseded and `backups.md` is replaced by the restore runbook.
- [ ] Vaults are not in the bucket: Obsidian Sync is their copy.

### 6.5 Secrets in Secret Manager
As the admin, I want secrets kept out of files I could lose or leak.
- [ ] These live in Secret Manager in the `atlas` project:
  - `ANTHROPIC_API_KEY`, the OpenAI API key, `AGENT_SECRET`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`.
  - Obsidian logins are not secrets in Secret Manager: each is made once by hand and kept in that user's sync volume (§6.3).
- [ ] **On the VM:** the VM reads them at start through its own service account, which can read only those secrets. None is baked into an image or committed. Non-secret settings (origins, admin email, time zone) stay in a plain config file on the VM.
- [ ] Rotating a secret is: add a new version, then restart the stack. The runbook says how.
- [ ] Local development on the Mac keeps using a git-ignored `.env`.

### 6.6 The VM and access
As Naresh, I want the app always on and reachable only by my devices.
- [ ] **VM:** one e2-small VM in asia-southeast1 in the `atlas` project, with a persistent disk for the database volume and vaults. It runs the Compose stack and restarts it after a reboot.
- [ ] **Network:** the VM has no inbound ports open to the internet. The app is published to the tailnet with `tailscale serve` as on the Mac. Admin access is over Tailscale SSH, or the Google console as a fallback.
- [ ] **Origins:** `APP_ORIGINS` and the Google client's redirect URIs cover the VM's Tailscale address. Sign-in and Gmail connect work there.
- [ ] **Docs:**
  - `phone-access.md` is rewritten for the VM ("keep the Mac awake" goes);
  - `google-cloud-setup.md` is rewritten for the new `atlas` project, including publishing the app to *In production*;
  - a setup runbook gives the expected monthly hosting cost.

### 6.7 Images and deployment
As Naresh, I want deploying to be a short, written procedure.
- [ ] Images for the app and the agent are built on the Mac for `linux/amd64`, tagged with the version and pushed to Artifact Registry in the `atlas` project.
- [ ] The VM pulls them with its service account (read-only on the registry) and starts them with the production Compose file. A deploy is: build and push, then pull and restart.
- [ ] A version is rolled back by deploying the previous tag.
- [ ] The local `docker compose` on the Mac keeps working for development and the e2e run.

### 6.8 Cutover and the old GCP project
- [ ] The release checklist ends with:
  - signing in on the VM from the phone and the Mac;
  - one video, one article and one feed item taken through to a saved note that appears in Obsidian on the Mac;
  - a Melete review on the phone;
  - a test restore.
- [ ] The old GCP project is kept until the checklist passes (local development still signs in through it, until its client is replaced), then shut down by Naresh.

## 7. Constraints
- **Rename first:** the rename is the first checkpoint, finished before any GCP resource is created.
- **No new cloud services** beyond those named here: Compute Engine, Artifact Registry, Cloud Storage, Secret Manager and IAM in one project, plus Tailscale, Obsidian Sync and the OpenAI API.
- **New dependencies** only as named in the TRD.
- **Tests:** no test touches the network, GCP, OpenAI, Obsidian or a real vault. The e2e smoke test keeps running locally against fakes.
- **Logs:** paths and IDs only, never note text or secrets (ADR 0049).
- **Nothing assumes the Mac:** the production stack runs from the VM's own files and Secret Manager, with no path, host or tool from the Mac.

## 8. Out of scope (KIV)
- yt-dlp cookies and a residential proxy for YouTube on datacenter addresses (next release).
- GitHub Actions building and pushing images (needs Workload Identity Federation from GitHub to GCP).
- The second user's Obsidian Sync, Obsidian account and vault.
- Uptime alerting, a staging VM, Cloud Run.
- An MCP server over the synced vault, so Claude Desktop, Claude Code or claude.ai can search and read notes from anywhere. It would sit on top of Obsidian Headless, not replace it (MCP doesn't move files).
- A per-person Obsidian vault name setting (0.9.1 deferral; likely moot with synced vaults).
- Carried forward: business-idea validator, job-alert intake (ADR 0041), wealth tracker, freelance-jobs module.

## 9. Open questions
None. The eight below were settled in the TRD (ADRs 0073–0078):
1. **Transcription.** How audio is prepared for `gpt-transcribe` (compression vs splitting, and any duration limit), how the transcript is stored without segments, and what goes with caret sync and timestamp links.
2. **Obsidian Headless.**
   - How it runs: one container per user or one container for many vaults;
   - how it logs in (credentials, end-to-end encryption password) without a person at a prompt;
   - how its health is read for the Status panel;
   - how a vault's first download is handled.
3. **Secrets to containers.** How secrets reach the containers: a start-up step that renders an env file from Secret Manager, or the app reading Secret Manager itself.
4. **Litestream.** Sidecar container or in-process, retention, the GCS credentials, and the restore procedure.
5. **VM build.**
   - OS image, disk size and type, and boot-time start of Compose;
   - how Tailscale is installed and kept running;
   - whether the VM's setup is a written script or a checklist.
6. **Production Compose.** How the VM's file differs from the local one (registry images, no build, no backups mount, Litestream and sync services), and how the two are kept from drifting.
7. **Status panel rows.**
   - Rows for transcription, replication and sync, and what each checks;
   - whether the transcription check costs anything.
8. **Rename mechanics.** One sweep or per package, and how the e2e and Python paths are renamed safely.

Decided while scoping:
- Atlas is the umbrella app; Mnemosyne stays the transcriber module, with its note tag and folder unchanged.
- The rename comes first, inside 0.10.0, not as a separate release.
- A new `atlas` GCP project rather than renaming the old one, whose ID can't change.
- OpenAI `gpt-transcribe` for transcription, without timestamps; whisper-server deleted. Fresh database on the VM. Litestream replaces manual backups. Secret Manager for secrets. Images built on the Mac and pushed to Artifact Registry. yt-dlp workarounds deferred.
- Obsidian Headless designed for two users, with only Naresh's sync configured. Not an Obsidian MCP server: those either need the desktop app running or read a vault that something else syncs.
