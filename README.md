# Atlas

Paste a YouTube URL and get a transcript, or paste an article URL, and get a Claude-written summary that you review and save as a note in your Obsidian vault. You can also subscribe to RSS or Atom feeds, and connect Gmail (read-only) to pick up email newsletters, and choose which new items to summarize. It runs on your Mac; the YouTube link sent to Gemini, the pages and feeds the server fetches, the emails it reads from Gmail, and the transcript, article or email text sent to the Claude API for the summary are the only things that leave the machine.

Atlas is for a small group, not the public: you (the admin) and the people you add each sign in with Google, have their own vault under one shared vaults folder, and see only the modules you switch on for them: **Mnemosyne** (summary notes), **Melete** (recall questions) and **Themis** (goals and time). [docs/guide.md](docs/guide.md) says how each works.

## Requirements

- macOS on Apple Silicon
- Docker Desktop
- An Anthropic API key (summaries cost a small amount per video) and two Google API keys, a Gemini API key from Google AI Studio on a paid tier and a YouTube Data API key (Gemini transcribes YouTube videos and is billed per token; see [`docs/google-cloud-setup.md`](docs/google-cloud-setup.md))
- A folder on this Mac that holds the vaults, one Obsidian vault folder per person (see the [guide](docs/guide.md#accounts-vaults-and-modules))
- A Google account for each person, and a one-time Google Cloud setup for sign-in ([`docs/google-cloud-setup.md`](docs/google-cloud-setup.md))
- A shared secret for the vault agent service (`AGENT_SECRET`, see Setup)
- Optional, for Gmail newsletters: the same Google client with the Gmail scope added (same setup guide)
- Optional, to run it away from your Mac: a Google Cloud VM, a Tailscale account and an Obsidian Sync subscription per synced person ([`docs/deploy.md`](docs/deploy.md))

For development you also need Node 24, pnpm (the version in `packageManager` in `package.json`) (nothing else: Gemini and YouTube are reached with API keys, so there is no tool to install or sign in with).

The web browser tests (`pnpm --filter web test:browser`) run in real Chromium and WebKit. Install them once:

```sh
pnpm --filter web exec playwright install chromium webkit
```

## Setup

1. Set up Google sign-in once ([`docs/google-cloud-setup.md`](docs/google-cloud-setup.md)), then copy `.env.example` to `.env` and fill in `ANTHROPIC_API_KEY`, `GEMINI_MODEL` (for example `gemini-3.8-flash`), `GEMINI_API_KEY` (from Google AI Studio), `YOUTUBE_API_KEY` (a YouTube Data API v3 key), `ADMIN_EMAIL` (your Google account; it becomes the admin on the first sign-in), `APP_ORIGINS` (`http://localhost:3100`, plus your Tailscale address if you use one), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`), `VAULTS_HOST_PATH` (the absolute path of the folder that holds the vaults, for example `~/Vaults`, with your Obsidian vault as a folder inside it) and `AGENT_SECRET` (the secret the app and the vault agent service share; make one with `openssl rand -hex 32`). `.env.example` also sets `COMPOSE_FILE`, which makes plain `docker compose` use `docker-compose.yml` plus `compose.local.yml` (the one that builds the images here). Compose refuses to start without the required ones. Then start the app, which builds two images, the app and the agent:

   ```sh
   docker compose up -d --build
   curl http://localhost:3100/api/health
   ```

2. Open <http://localhost:3100>, sign in with Google as `ADMIN_EMAIL` and choose your vault ([guide](docs/guide.md#accounts-vaults-and-modules)).
   **Upgrading from Mnemosyne 0.9.x:** Atlas uses a new Compose project (`atlas`), volume (`atlas_data`) and database file (`atlas.db`), so it starts empty and everyone signs in again. The old volume is left alone; once you no longer need it, remove it with `docker volume rm mnemosyne_mnemosyne-data` (list volumes with `docker volume ls`).
   **Upgrading from 0.9.x to 0.10.0:** whisper-server is gone. Stop its launch agent (`launchctl bootout gui/$(id -u)/com.naresh.whisper-server`) and delete its plist from `~/Library/LaunchAgents/`; add `GEMINI_MODEL`, `GEMINI_API_KEY`, `YOUTUBE_API_KEY` and the `COMPOSE_FILE` line to `.env`, and remove `OPENAI_API_KEY` (OpenAI and yt-dlp are no longer used; a leftover `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `TRANSCRIPTION_MODEL`, `POT_PROVIDER_URL`, `GOOGLE_CLOUD_PROJECT`, `GEMINI_LOCATION`, `GEMINI_ACCESS_TOKEN`, `WHISPER_URL`, `WHISPER_MODEL`, `BACKUP_DIR` or `BACKUP_HOST_PATH` is logged as ignored). The backups folder is no longer mounted; the Docker data volume is not touched.
   To run it on a VM instead, follow [`docs/deploy.md`](docs/deploy.md). To review in Melete from your phone, see [`docs/phone-access.md`](docs/phone-access.md) (Tailscale, a private HTTPS address, Add to Home Screen). The app is published on `127.0.0.1` only.

## Google Cloud setup

Sign-in and Gmail share one Google OAuth client. [`docs/google-cloud-setup.md`](docs/google-cloud-setup.md) has the whole setup: the scopes (`openid email profile`, and read-only `gmail.readonly` if anyone connects Gmail), the two redirect URIs each address in `APP_ORIGINS` needs, adding people as test users while the app is in *Testing*, and why publishing it matters for Gmail. After it, press **Connect Gmail** in Settings → Sources and approve read-only access; you land back in Settings with **Connected as** your address.

## Development

```sh
pnpm install
pnpm dev                                        # server on :3100, web on :5173 (proxies /api)
pnpm test                                       # unit tests, all packages (the agent's pytest included) and the script tests (Compose, deploy scripts, shellcheck)
pnpm --filter web test:browser                  # real-browser tests (Chromium and WebKit)
pnpm --filter @atlas/server test:integration  # the real Claude API (needs ANTHROPIC_API_KEY)
pnpm lint
pnpm typecheck
pnpm build
pnpm --filter @atlas/agent exec uv run pytest -m docker   # builds the agent image and checks it (needs Docker)
pnpm e2e                                        # the whole stack against local fakes (needs Docker; slow)
```

`pnpm e2e` builds the Compose stack under its own project name and port (3101) with a temporary vault folder, serves pages, a feed, the Gemini and YouTube Data APIs' endpoints and the Anthropic API from local fakes, runs the Playwright tests, signed in through a test-only session route that exists only in that stack (`E2E_TEST_SIGNIN`, refused outside `NODE_ENV=test`): an article through summary, linking and save; a feed and its inbox; the Status panel; Melete; a subject's syllabus, mapping, gaps and measured time (its own user and vault, so it never shares a review queue with the Melete spec); Themis: areas and goals, a linked subject, logged and measured time and a check-in (its own user and vault; the check-in goal is back-dated in the throwaway stack's database with `docker exec`, because a goal made during the run never has a check-in due); and a member who chooses a vault and sees only their own modules and data and tears everything down, including its volume. It never touches your running instance or the network. It is not part of `pnpm test`; run it at the end of each piece of work and before a release.

`pnpm --filter @atlas/server fixture:gmail <messageId> <name> [display name]` saves a real email from the connected account as a test fixture in `apps/server/src/test-support/gmail/`, with your address, name and the links reduced to a host and a generic path. No test touches Gmail or the network; they use these fixtures and fakes.

Stop the container first (`docker compose stop`): the dev server and the container both use port 3100. Open <http://localhost:5173> while developing. The integration test needs `ANTHROPIC_API_KEY` and is skipped without it.

Layout: `apps/server` (Express API, worker, tool clients, formatters), `apps/web` (React UI), `apps/agent` (Python vault agent service: read-only vault tools and the Claude linking agent), `packages/shared` (Zod schemas used by both), `deploy/` (the sync image, the Litestream config, the VM scripts and the release script; [`docs/deploy.md`](docs/deploy.md)), `ops/` is gone with the entrypoint script that updated yt-dlp (ADR 0081).

## Stopping

```sh
docker compose stop
```

On a stop signal the server stops taking work and lets a running job finish, for up to 60 seconds, then exits. Docker allows 75 seconds before it kills the container. A second signal exits immediately: press Ctrl+C twice under `pnpm dev`, or run `docker compose kill` for the container. A killed job that was mid-transcription is marked failed on the next start; a job that was summarizing is resumed.

## Where the docs are

- [docs/guide.md](docs/guide.md): how Atlas works and how to use it
- [docs/configuration.md](docs/configuration.md): every environment variable
- [docs/troubleshooting.md](docs/troubleshooting.md): symptoms and fixes
- [docs/architecture.md](docs/architecture.md): how the parts fit today; the reasons are the ADRs in [docs/decisions/](docs/decisions/)
- [docs/deploy.md](docs/deploy.md), [docs/phone-access.md](docs/phone-access.md), [docs/google-cloud-setup.md](docs/google-cloud-setup.md): hosting and setup
- [docs/README.md](docs/README.md): every version's plan and release notes, and the ADR index
- [docs/roadmap.md](docs/roadmap.md): possible next steps
