# Atlas v0.10.0 — Release notes

v0.10.0 renames the app to **Atlas** and moves it from a Mac to a small Google Cloud VM. Videos are no longer downloaded: Gemini reads a YouTube link and writes the transcript. The old download pipeline (yt-dlp, ffmpeg, OpenAI, whisper-server) is gone.

## New
- **The app is called Atlas.** The transcriber module is still labelled Mnemosyne; Melete is unchanged. Packages are `@atlas/*`, the Compose project is `atlas`, the database is `atlas.db` (ADR 0073).
- **It runs on a VM** (ADRs 0075–0078, [`docs/deploy.md`](../deploy.md)). Docker Compose on one Debian VM runs the app, the vault agent, Litestream and one Obsidian Sync client per synced person. Litestream replicates the database to a Cloud Storage bucket, vaults come from Obsidian Sync, images from Artifact Registry and secrets from Secret Manager into memory when the service starts. People reach it over Tailscale only. `release.sh` builds and pushes the images, `deploy.sh` deploys and rolls back.
- **YouTube is transcribed by Gemini from the link** (ADRs 0081–0083). The YouTube Data API gives the title, channel and length; the Gemini Developer API is handed the public link and writes a verbatim transcript in one request. YouTube answers the VM with a bot check, so nothing is downloaded and the VM never contacts YouTube for the video. Vertex AI was tried first and refused YouTube input from the VM's service account, so Gemini is reached with an API key (`gemini-api-key`, paid tier).
- **A transcript Gemini cut short is marked.** If it stops at its output limit the partial transcript is kept and the review screen says so.
- **Transcription cost is recorded.** Each run stores Gemini's input and output tokens and an estimated cost, shown in Settings → Admin → Usage. The rates are dated: Google's list doubles them on 2027-01-01 and the estimate follows the date.
- **New Status rows.** Transcription (Gemini); on the VM, the admin's Replication row and each person's Vault sync row.
- **Admins can stop members creating vaults.** `VAULT_CREATE_ENABLED=false` (the VM) hides **New vault** and tells people to ask the admin, because a folder without a sync client would never reach Obsidian.

## Changes
- **Video is YouTube-only.** Vimeo, Dailymotion, TikTok and Twitch links are refused with "Only YouTube videos are supported" (they are not read as articles either). Private, unlisted, members-only and age-restricted videos fail before anything is billed.
- **Videos have no timestamps and no `.srt`.** Transcripts are plain paragraphs; downloads are Markdown and TXT. Caret-following between the note and the transcript is gone.
- **Job steps.** A video job goes queued → transcribing → summarizing; the downloading and converting steps no longer exist.
- **Backups.** The manual **Back up now** button and the backups folder are gone; Litestream replicates continuously on the VM (ADR 0076). Pre-migration copies of the database go to `pre-migration/` beside it.
- **Removed:** yt-dlp, ffmpeg, the OpenAI client, whisper-server, the PO token provider and the app image's entrypoint script. The app image went from 1.15 GB to about 490 MB.
- **Variables.** New: `GEMINI_MODEL`, `GEMINI_API_KEY`, `YOUTUBE_API_KEY`, `VAULT_CREATE_ENABLED`, `LITESTREAM_METRICS_URL`, `VAULT_SYNC_STATUS_DIR` and the Compose variable `COMPOSE_FILE`. Removed (a leftover value is ignored and logged at `warn`): `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `TRANSCRIPTION_MODEL`, `POT_PROVIDER_URL`, `WORK_DIR`, `GOOGLE_CLOUD_PROJECT`, `GEMINI_LOCATION`, `GEMINI_ACCESS_TOKEN`, `WHISPER_URL`, `WHISPER_MODEL`, `BACKUP_DIR`, `BACKUP_HOST_PATH`.
- **Compose is three files** (`docker-compose.yml`, `compose.local.yml`, `compose.prod.yml`); `.env.example` sets `COMPOSE_FILE` so plain `docker compose` builds locally.
- **Database.** Schema 13. An older database is upgraded with a copy kept in `pre-migration/`; a video job that was downloading or converting fails with "Interrupted by upgrade". The server refuses to start on a database from a newer version.
- **Secrets.** Six: `anthropic-api-key`, `youtube-api-key`, `gemini-api-key`, `agent-secret`, `google-client-secret`, `token-encryption-key`.

## Upgrading
- **On the Mac:** add `GEMINI_MODEL`, `GEMINI_API_KEY`, `YOUTUBE_API_KEY` and the `COMPOSE_FILE` line to `.env` and `apps/server/.env`, delete the removed variables, stop whisper-server's launch agent and delete its plist, and remove the old Docker volume `mnemosyne_mnemosyne-data` once you no longer need it (the new project starts empty and everyone signs in again).
- **On the VM:** follow [`docs/deploy.md`](../deploy.md). Coming from the OpenAI build, see "Upgrading from the OpenAI and yt-dlp build": add the two secrets, remove the old `roles/aiplatform.user` grant, disable the Vertex API, delete `openai-api-key` and revoke the OpenAI key.

## Deferred
- Other video sites and unlisted or private videos.
- GitHub Actions for release, the second person's Obsidian sync, uptime alerting, Terraform, and an MCP server over the vault.
- Removing `google-auth-library`: it stays for Google sign-in only.

## Known issues
- Only public YouTube videos work. A very long video may fill Gemini's output limit and be cut short; the transcript is kept and marked.
- Gemini's input and output limits for `gemini-3.8-flash` on the Developer API are not stated in one place; check a long video before relying on it.
- Obsidian Headless is in open beta.
- Costs are estimates from a price table; the Google Cloud console has the real figure.
- Pages that need JavaScript or a login can't be read as articles (paste the text instead).
