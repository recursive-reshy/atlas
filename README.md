# Mnemosyne

Paste a video URL (YouTube or anything yt-dlp supports) and get a timestamped transcript, or paste an article URL, and get a Claude-written summary that you review and save as a note in your Obsidian vault. You can also subscribe to RSS or Atom feeds, and connect Gmail (read-only) to pick up email newsletters, and choose which new items to summarize. It runs on your Mac; the video download, the pages and feeds the server fetches, the emails it reads from Gmail, and the transcript, article or email text sent to the Claude API for the summary are the only things that leave the machine.

Mnemosyne is for a small group, not the public: you (the admin) and the people you add each sign in with Google, have their own vault under one shared vaults folder, and see only the modules you switch on for them (Transcriber, Melete). Version 0.8.0 added **Melete**, a study module in the same app: it turns the notes in a vault folder into recall questions, schedules them with spaced repetition and quizzes you in the browser, including from your phone. See [Accounts](#accounts-vaults-and-modules) and [Melete](#melete).

## How it works

You submit a URL in the browser; it is a video or an article, detected from the host and overridable. The Express server queues a job, and a worker runs one job at a time through a source adapter. For a video, yt-dlp downloads the audio, ffmpeg converts it to 16 kHz mono WAV, and the WAV is sent over HTTP to whisper-server. The transcript is stored in a SQLite database and rendered to Markdown, SRT or TXT when you download it. For an article, the server fetches the page itself, extracts the main text and stores it as Markdown; a page it can't read (a login or a paywall) is handled by pasting the article's text. The worker then sends the transcript or article to the Claude API for a summary (key points, quotes, tags; article notes have no timestamps), using the prompt profile and model you picked in Settings or for that video. You review the note in the browser, where every edit is saved to the server as a draft, pick the vault folder it goes to, and saving writes it there and deletes the transcript or article. Feeds: you subscribe in Settings, the server checks them on a schedule, and new items wait in the Inbox on the home page; nothing is fetched or summarized until you summarize an item (or switch a feed to summarize automatically). Gmail: you connect your account once in Settings (read-only), add sources (Gmail labels or a Gmail search), and the server reads new matching emails on the same schedule; they wait in the same Inbox, and summarizing one turns the email body into an article job whose note links back to the email in Gmail. Linking: after the summary, the server asks a separate vault agent service (a small Python service in its own container, with the vault mounted read-only) which existing notes and concepts the new note should link to. The agent searches and reads the vault with Claude (Haiku by default) and returns suggestions; nothing is written to the vault by it. In review you accept or reject each link, and accepted links are inserted into the note's draft as `[[wikilinks]]`, so they land in the vault when you save. Jobs you leave in review are deleted after 24 hours; every edit starts the 24 hours again. The browser polls the job's status. Every job follows one documented lifecycle that the code enforces (a move it doesn't allow is refused and logged, ADR 0048). A Status panel in Settings shows whether each feed, Gmail source, the Gmail connection, the agent service and whisper-server is working, and **Back up now** copies the database to a folder on your Mac. The server and the agent write JSON logs, and a job's ID is on every line about it in both. Melete: you choose a learning root in the vault, its folders are subjects, and the server scans them when you open Melete. Notes you enroll get up to 10 recall questions written by Claude (a separate generator loop beside the job worker), each scheduled with FSRS (the `ts-fsrs` library, 90% target recall). In a review, Claude grades a typed answer or you rate yourself, and your rating sets when the question comes back. Melete only reads the vault; its questions and reviews live in the same SQLite database. Everything is per person: jobs, feeds, Gmail, prompts, settings, notes and Melete questions belong to the signed-in user, and another user's item is a 404, never a 403 (ADR 0062). The background loops (worker, feed and Gmail poller, Melete generator) serve everyone, taking turns between users with work waiting (ADR 0064). The app is published on `127.0.0.1` only; [`docs/phone-access.md`](docs/phone-access.md) shows how to reach it from a phone over Tailscale.

```text
browser ──> Express + worker (Docker, :3100)
                │
                ├─ fetch articles and feeds (Readability, feedsmith)
                ├─ Gmail API   read newsletters (read-only, optional)
                ├─ yt-dlp   download audio
                ├─ ffmpeg   convert to WAV
                ├─ whisper-server (native on the Mac, Metal GPU, :8178)
                ├─ Claude API   summarize the transcript
                └─ vault folder  save the reviewed note (bind mount)
                        │
                        v
         transcript ──> downloads; summary ──> Obsidian note
```

## Requirements

- macOS on Apple Silicon
- Docker Desktop
- An Anthropic API key (summaries cost a small amount per video)
- A folder on this Mac that holds the vaults, one Obsidian vault folder per person (see [Accounts](#accounts-vaults-and-modules))
- A Google account for each person, and a one-time Google Cloud setup for sign-in ([`docs/google-cloud-setup.md`](docs/google-cloud-setup.md))
- A shared secret for the vault agent service (`AGENT_SECRET`, see Setup)
- Optional, for Gmail newsletters: the same Google client with the Gmail scope added (same setup guide)
- Homebrew `whisper-cpp`, which provides `whisper-server`:
  ```sh
  brew install whisper-cpp
  ```
- Two model files in `~/whisper-models/`:
  - `ggml-large-v3-turbo-q5_0.bin` from [ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin)
  - `ggml-silero-v5.1.2.bin` (voice activity detection) from [ggml-org/whisper-vad](https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin)

For development you also need Node 24, pnpm (the version in `packageManager` in `package.json`), and `yt-dlp` and `ffmpeg` from Homebrew:

```sh
brew install yt-dlp ffmpeg
```

The web browser tests (`pnpm --filter web test:browser`) run in real Chromium and WebKit. Install them once:

```sh
pnpm --filter web exec playwright install chromium webkit
```

## Setup

1. Run whisper-server as a login agent. `ops/com.naresh.whisper-server.plist` hard-codes `/Users/naresh/...` paths for the models and the log file; edit them to match your home folder first. Then:

   ```sh
   cp ops/com.naresh.whisper-server.plist ~/Library/LaunchAgents/
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.naresh.whisper-server.plist
   curl http://127.0.0.1:8178
   ```

   Logs are in `~/Library/Logs/whisper-server.log`. `ops/README.md` has the check, stop and remove commands.

2. Set up Google sign-in once ([`docs/google-cloud-setup.md`](docs/google-cloud-setup.md)), then copy `.env.example` to `.env` and fill in `ANTHROPIC_API_KEY`, `ADMIN_EMAIL` (your Google account; it becomes the admin on the first sign-in), `APP_ORIGINS` (`http://localhost:3100`, plus your Tailscale address if you use one), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`), `VAULTS_HOST_PATH` (the absolute path of the folder that holds the vaults, for example `~/Vaults`, with your Obsidian vault as a folder inside it), `BACKUP_HOST_PATH` (the absolute path of a folder for database backups; see [`docs/backups.md`](docs/backups.md)) and `AGENT_SECRET` (the secret the app and the vault agent service share; make one with `openssl rand -hex 32`). Compose refuses to start without the required ones. Then start the app, which builds two images, the app and the agent:

   ```sh
   docker compose up -d --build
   curl http://localhost:3100/api/health
   ```

3. Open <http://localhost:3100>, sign in with Google as `ADMIN_EMAIL` and choose your vault (below).
   To review in Melete from your phone, see [`docs/phone-access.md`](docs/phone-access.md) (Tailscale, a private HTTPS address, Add to Home Screen). The app is published on `127.0.0.1` only.

## Google Cloud setup

Sign-in and Gmail share one Google OAuth client. [`docs/google-cloud-setup.md`](docs/google-cloud-setup.md) has the whole setup: the scopes (`openid email profile`, and read-only `gmail.readonly` if anyone connects Gmail), the two redirect URIs each address in `APP_ORIGINS` needs, adding people as test users while the app is in *Testing*, and why publishing it matters for Gmail. After it, press **Connect Gmail** in Settings → Sources and approve read-only access; you land back in Settings with **Connected as** your address.

## Accounts, vaults and modules

- **Signing in.** Everyone signs in with Google. The first account to sign in must be `ADMIN_EMAIL`; after that only people the admin has added get in, and anyone else sees a plain "not allowed" page. A sign-in lasts `SESSION_DAYS` (30) from last use. **Sign out** is at the bottom of the navigation drawer. The server keeps only a hash of the session token.
- **Your vault.** The vaults folder (`VAULTS_HOST_PATH`, `/vaults` in the container) holds one folder per person. On the first sign-in you choose yours: **Use this vault** to claim a folder nobody has claimed (the way to bring an existing Obsidian vault, which must be a direct child of the vaults folder), or **Create vault** for a new folder (lowercase letters, digits and hyphens, up to 40 characters). Nobody can claim a folder someone else has, and nobody can see another person's vault; the app and the agent refuse a vault path outside the vaults folder, including through a symlink. Until you choose, nothing that needs the vault works (the answer is "Choose your vault first"). If the folder is later deleted, renamed or unmounted, the app says "Your vault folder is missing" (a 409, not an error page) and shows the same page again, with a note naming the folder: claim another folder or create a new one, the admin included (ADR 0070). Nothing is deleted; Melete marks the missing notes and restores them if they come back, and queued work for you waits or fails with that message until you choose. Put the folder back instead and the app carries on.
- **Modules.** The admin switches **Transcriber** (videos, articles, feeds, Gmail, linking) and **Melete** on or off for each person. A person sees only their modules in the drawer and in Settings; a page or API route of a module they don't have is a 404, and they land on their first module. A person with no module sees a page saying the admin hasn't switched anything on. The admin always has every module and the Admin tab.
- **Admin tab** (Settings → Admin, admin only). **Add user** takes an email, a name and the modules. Each person has module switches and **Remove** (signs them out at once and stops their feeds, jobs and Melete work; nothing is deleted, and **Restore** brings it back), **Reset vault** (lets them choose again; the folder is not touched) and **Delete user**, only for a removed person and with their email typed to confirm, which deletes all their data from the database (never files in a vault). You can't remove, reset or delete yourself. Below the users, **Usage** shows, for a month you pick (in `APP_TIME_ZONE`), each person's estimated cost by category (summaries, linking, Melete) and transcription minutes.
- **What is shared and what isn't.** Per person: prompt profiles, models and settings, feeds, the Gmail connection, jobs, notes, Melete. App-wide, admin only: the feed check interval, **Back up now** and the Status rows for the agent, whisper-server and the backup. One person's failing feed is not shown to another.

## Using it

1. Paste a video or article URL and submit. Under the field a **Video / Article** switch shows what was detected; click it to override. The button reads Transcribe for a video and Summarize for an article. **Paste text instead** (for articles) takes the article's text with an optional title, and nothing is fetched. Below the field, **Prompt profile** and **Model** start on your defaults (see Settings below); change them to use another for this video only.
2. Watch the stages: for a video queued, downloading, converting, transcribing, summarizing, ready for review; for an article queued, fetching, summarizing, ready for review. If the page can't be read the job fails with the reason and **Paste text**, which continues the same job with the text you paste.
3. Download the transcript as Markdown, SRT or TXT while a video job is in review (an article offers Markdown only).
4. Review the note. It opens in a rendered editor with a properties panel (title and tags). A toolbar above the note formats it: undo and redo, block type (paragraph, heading 1 to 3, quote), bold, italic, bulleted and numbered lists, and links. It writes plain Markdown (`#`–`###`, `>`, `**bold**`, `*italic*`, `-`, `1.`, `[text](url)`), so Obsidian reads the note as expected. Switch to source mode to see and edit the raw Markdown, front-matter included; the formatting buttons are hidden there. The transcript (or, for an article, its text) sits beside it; clicking a timestamp in the note, or moving the cursor onto one, scrolls the transcript there.
5. Choose where the note goes with **Change folder**: filter the vault's folders (hidden folders are not shown), pick one, or type a new folder name under the chosen folder. A new folder is created only when you save. Without a choice the note goes to `DEFAULT_NOTE_FOLDER`.
6. **Save to vault** writes the note and deletes the transcript, or **Discard** deletes the job.
7. Under the note a line shows how the summary was made: the model, the prompt profile and its version, the tokens in and out, and an estimated cost (for example `Claude Sonnet 5.5 · Business ideas v3 · 31.2k in / 1.4k out · ~US$0.12`). If the summary was made more than once it also gives the number of attempts and the total. The cost is an estimate from a price table in the app, marked with `~`; a model that isn't in the table shows tokens only. The record is kept in the database even after you save or discard the job.
8. **Linking.** When a summary finishes, a **Linking** step follows (a few seconds to a minute) and the review screen opens with two tabs: **Suggested links (n pending)** and **Source**. Each suggestion shows the target as `[[Target]]`, whether it is an existing note, an existing concept or a new concept, where it goes (`at "phrase"`, the first place that phrase appears in your note, or under `## Related`) and why. **Accept** inserts the link into the note; **Reject** drops it. A suggestion whose phrase you have since edited away is marked **Stale** and offers **Add to Related** instead; one with no phrase does the same. **Accept all** and **Reject all** appear when two or more are pending. Accepting edits the note and saves it as a draft in one step; nothing reaches the vault until you save. A new concept is a `[[link]]` to a note that doesn't exist yet: Obsidian shows it in the graph and creates the note if you open it; the app never creates stub files. At most 8 links are suggested, and only the new note gets links (Obsidian's backlinks show the other direction).
9. **Re-run linking** asks the agent again on the note as it is now (it confirms first if suggestions are still pending, because they are replaced). If linking failed, the review screen says why and offers **Retry linking**; a note that was never linked (linking off, or the agent not set up when it was summarized) offers **Run linking**. A failed linking never fails the job: the note is still there to review and save. Under the note, a second info line shows the linking model, prompt version, tool calls, tokens and estimated cost.
10. **Regenerate summary** runs the summary again on the same transcript, with the profile and model you choose in a dialog (they start on what the job used). It replaces the current note, including your edits, and keeps the vault folder. Use it to compare prompts or models on a real video.

### Study profile and folder memory

**Study** is a fourth seeded summary profile, for notes you want to learn from later: key concepts with definitions, how and why, steps in order, common mistakes. Edit it in Settings → Prompts like the others. The folder picker on the review screen starts on the folder you last saved a note to with the same prompt profile (if it still exists in the vault), so Study notes can go to one place without choosing each time. Without a remembered folder it starts on `DEFAULT_NOTE_FOLDER`.

### Melete

Open **Melete** in the navigation drawer.

1. **Learning root.** The first time, **Choose learning root** asks for a vault folder (for example `Learning`). It must already exist; Melete never creates or changes anything in the vault. Each folder directly inside it is a **subject** (for example `Learning/TypeScript`); notes directly in the root belong to no subject and are ignored. Dot-folders such as `.obsidian` are skipped. Change the root from the settings action on the Today page.
2. **Subjects and notes.** Today lists the subjects with what is due and how many new questions remain today; open one to see its notes. Melete scans the vault when you open its pages (at most every 30 seconds), so a note you add or edit in Obsidian shows up on the next visit.
3. **Enrolling.** Nothing is quizzed until you enroll it: switch on a note, or use **Enroll all** on the subject page. **Auto-enroll new notes** enrolls notes that appear later. Enrolling queues question generation; the note shows *Generating…* and then *N questions*. A note that failed shows the reason and **Retry**. A note over 60,000 characters is refused; split it.
4. **Questions.** Each question has an answer and, where possible, the passage of your note it came from. On a note's page you can read them, **Drop** the ones you don't want, **Regenerate** all of them or **Open in Obsidian**. When you edit an enrolled note, its old questions are retired and new ones are generated (*Changed — regenerating*); the cards of retired questions are kept in the database. Moving a note to another folder or renaming it keeps its questions and history, as long as its text is unchanged.
5. **Reviewing.** **Start review** (all subjects) or a subject's **Review** shows one question at a time, due ones first, then new ones up to the subject's **New questions per day** (0 to 100, default 10; the day starts at `MELETE_DAY_START_HOUR`).
   - **Typed** mode: write your answer and **Check**. Claude marks it correct, partial or incorrect, lists what you got right and missed, and suggests a rating. A blank answer or "I don't know" skips the call and pre-selects **Again**. If grading fails you rate it yourself.
   - **Quick** mode: think of the answer, **Show answer**, then rate.
   - Rate with **Again**, **Hard**, **Good** or **Easy** (a suggested one is pre-selected; **Next** confirms it). On a keyboard, 1–4 select and Enter confirms. The toggle in the header switches mode from the next question on, and the choice is remembered.
   - **More → Drop question** removes a question from review. The screen ends with *All done for now*.
6. **Models and prompts.** Settings → Models has a **Melete** section for the question and grading models (Haiku by default). Settings → Prompts has two more prompts under **Melete**, one for questions and one for grading, with versions and reset like the others.
7. **From your phone.** Follow [`docs/phone-access.md`](docs/phone-access.md), then Add to Home Screen; the icon opens Melete.

### Settings

The gear at the bottom of the navigation drawer opens **Settings**, which has up to four tabs across the top: **Prompts**, **Models**, **Sources** and, for the admin, **Admin**. A person sees the tabs that fit their modules (someone with Melete only has no Sources tab, and their Prompts and Models show only Melete's). Each tab has its own address (`/settings/prompts`, `/settings/models`, `/settings/sources`, `/settings/admin`), so you can bookmark one, and Back returns to the previous tab. `/settings` opens Prompts. Leaving a tab or a prompt with unsaved edits asks first.

**Prompts** has a list on the left (the summary profiles, then the linker prompt) and the selected prompt's editor, history and locked instructions on the right; on a narrow window the list and the editor are separate screens. The selected prompt is in the address (`/settings/prompts/<id>`), so a reload keeps it.

**Models** has the summary model and prompt profile defaults, the linking model and the linking switch.

**Sources** starts with the Status panel, then the feeds and Gmail.

- **Default model and default prompt profile.** They save as soon as you change them. The model list comes from Anthropic, so new models appear without an update, and only models that can produce the structured summary are listed. If Anthropic can't be reached the list shows just the current default and says it is offline. The submit form and the Regenerate dialog can pick another profile or model for one video.
- **Prompt profiles.** A profile is a named prompt (up to 20,000 characters) that tells Claude what to pull out of a video. Three ship with the app: **Business ideas** (the default, aimed at validating ideas), **Coding** and **General** (the 0.3 summary). You can create, rename and delete profiles (the default and the last remaining one can't be deleted). Edit a prompt and **Save** to store it as a new version; unsaved changes are marked, and switching profile, tab or page, or closing the tab, asks first. A changed prompt applies to summaries that start after you save; notes already in review keep what they have.
- **History.** Every save is a numbered version. Open any version to read it, and **Restore this version** saves a copy of it as the newest. **Reset to default** does the same with the shipped text, for the profiles that ship.
- **Instructions the app always sends.** Read-only views (one for videos, one for articles) of the fixed part of the prompt that keeps the output in the shape the app needs. Your prompt is added after it, so no edit can break the note.

- **Linking.** If `AGENT_SECRET` isn't set, says how to set it up (whether the agent is reachable is in the Status panel). **Link notes automatically** turns the linking step on or off for new summaries (it starts on). **Linking model** is separate from the summary model and starts on a Haiku model when the model list has one (ADR 0047). **Linker prompt** is the guidance that tells the agent what makes a good link, with save, history, restore and reset exactly like the summary prompts; it can't be renamed or deleted. **Instructions the app always sends** shows the locked part of the linker's prompt, read from the agent service (unavailable while it is down).
- **Status panel.** The first thing on the Sources tab: one row each for the backup, the agent service, whisper-server, the Gmail connection, every Gmail source and every feed, with its last check, its last success ("never" if it hasn't worked yet) and a state: **OK**, **Failing** (with the latest error) or **Off** (a disabled source, linking off, Gmail not connected). Open a failing row to see its last 5 errors with times. A Gmail connection that Google no longer accepts says so and has **Reconnect**. The agent and whisper-server are checked while the panel is open and every `STATUS_CHECK_INTERVAL_MINUTES` (2) in the background, and show as Failing whenever they are down, even if no job needs them. When anything is failing, a warning badge with the count appears on Settings in the drawer, from any page.
- **Backups.** **Back up now** on the Backups row writes a consistent copy of the database to `BACKUP_HOST_PATH` while the app keeps running, named by date and time, and shows its name and size. There is no schedule and the app never deletes a backup. The copy has the database only: it never holds `TOKEN_ENCRYPTION_KEY`, so keep `.env` somewhere safe. What is and isn't in it, and the restore steps, are in [`docs/backups.md`](docs/backups.md).
- **Feeds.** The admin sets how often feeds are checked (15 minutes to daily; it applies to everyone), **Check all now**, and **Add feed**: enter a feed address or a page that links to one, see its title and latest item, pick its prompt profile and whether it summarizes automatically. Each feed has an on/off switch, an automatic switch and a menu (Check now, Edit, Delete). Adding a feed doesn't import its back catalogue: only its newest item goes to the inbox. A check adds at most 10 new items per feed; the rest are marked seen and skipped, and the feed says how many. A failing feed shows its error and keeps being retried.
- **Inbox (feeds).** New feed items wait on the home page with their feed, title and date. **Summarize** (one item or a selection) turns them into normal jobs with the feed's profile, or one you choose for the batch, and the model you choose; **Dismiss** removes them. The jobs made from them show the feed's name.

- **Gmail.** After the setup above, **Connect Gmail** links your account (the section explains what's missing if the variables aren't set). **Disconnect** revokes the access at Google and deletes the stored token; your sources and inbox items stay. If Google stops accepting the connection (you revoked it, or the app went back to Testing), the section shows **Reconnect needed** with the reason, Gmail checks pause, and the Status panel marks the row Failing and the drawer's Settings item shows its warning badge; **Reconnect** resumes where it stopped.
- **Gmail sources.** **Add source** takes a name and either one or more Gmail labels (an email with any of them matches) or a Gmail search such as `from:news@example.com`; create labels and filters in Gmail itself. **Preview** shows how many emails match, the newest subject and sender, and a warning if another source has the same rule; a source can only be saved after a preview of its current rule. Choose a prompt profile, whether to **Summarize automatically**, and a **backfill**: none (only the newest email goes to the inbox), the last 30 or 90 days, or all, up to 200 emails. Backfilled emails only land in the inbox; they are never summarized automatically. Sources are checked on the feed interval; each has an on/off switch and a menu (Check now, Edit, Delete), and **Check all now** checks every enabled one. A check adds at most 10 new emails per source, and the rest are marked seen and skipped, as for feeds. Deleting a source asks whether to remove its inbox items.
- **Inbox.** On the home page, new feed items and newsletter emails wait together, newest first, each with its feed or source name; emails also show the sender and a link that opens the email in Gmail. **Summarize** and **Dismiss** work on one item or a selection. Summarizing an email uses its body as the article (links, images, tracking and the unsubscribe footer are dropped), and the note's `source` links to the email, `author` is the sender, `site` the source's name and `published` the date received. An email with too little text can't be summarized and stays in the inbox. Items don't expire; the jobs made from them follow the usual 24-hour review expiry.

The app opens with a navigation drawer on the left (**Transcriber**, with **Settings** and the colour-mode control at the bottom). The hamburger in the top bar collapses it to icons or expands it again, and the choice is remembered in the browser. On a narrow window the drawer is hidden and opens over the page. At the bottom of the drawer, **Light**, **Dark** and **System** set the colour mode (System follows the OS and is the default); that choice is remembered too. The note editor follows the colour mode too.

Edits are saved to the server about a second and a half after you stop typing, when you switch editor mode, leave the editor or choose a folder, and before saving, so a refresh, a crash or another browser shows your latest draft. The status line under the editor reads Saved, Saving… or Not saved, with the reason.

The page address carries the job (`?job=<id>`), so refreshing the page keeps you on the same job. Jobs and their transcripts live in a SQLite database on a Docker volume, so they survive a container restart or rebuild. A job that was downloading, converting or transcribing when the app stopped is marked failed on the next start.

The API also supports listing jobs, listing the vault's folders, updating a review draft, saving it, retrying a failed summary and discarding a job (`GET /api/jobs`, `GET /api/vault/folders`, `PATCH /api/jobs/:id/draft`, `POST /api/jobs/:id/save` with no body, `POST /api/jobs/:id/retry-summary`, `DELETE /api/jobs/:id`). Settings and summaries add `GET` and `PATCH /api/settings`, `GET /api/models`, the prompt profile endpoints under `/api/prompt-profiles` (list, create, rename, delete, versions, restore, reset), `POST /api/jobs/:id/regenerate-summary`, and optional `model` and `profile_id` in the `POST /api/jobs` body. Version 0.5.0 adds `source_type`, `text` and `title` to the `POST /api/jobs` body, `GET /api/jobs/:id/source` (replacing `/transcript`), `POST /api/jobs/:id/text` (pasted text for a failed article job), the feed endpoints (`GET` and `POST /api/feeds`, `POST /api/feeds/preview`, `POST /api/feeds/check`, `PATCH` and `DELETE /api/feeds/:id`, `POST /api/feeds/:id/check`) and the inbox endpoints (`GET /api/inbox`, `POST /api/inbox/summarize`, `POST /api/inbox/dismiss`, taking `{ kind: 'feed' | 'gmail', id }` items; these replace `/api/feed-items`). Version 0.6.0 adds the Gmail endpoints: `GET /api/gmail/account`, `GET /api/gmail/connect` (redirects to Google), `GET /api/gmail/oauth/callback` (Google's redirect target), `POST /api/gmail/disconnect`, `GET /api/gmail/labels`, and the sources under `/api/gmail/sources` (`GET` and `POST`, `POST /api/gmail/sources/preview`, `POST /api/gmail/sources/check`, `PATCH` and `DELETE /api/gmail/sources/:id`, `POST /api/gmail/sources/:id/check`). Jobs from Gmail carry `gmail_source_id` and `gmail_source_name`. Version 0.7.0 adds `GET /api/jobs/:id/link-suggestions`, `POST /api/jobs/:id/link-suggestions/accept` and `/reject` (taking `{ ids }`; accept also takes the edited `note_markdown`) and `POST /api/jobs/:id/linking` (run or re-run linking; optional `note_markdown`), the job status `linking`, the job fields `link_state`, `link_error` and `link_usage`, and `linking_enabled`, `linking_model`, `linker_profile_id`, `agent_status` and `linker_locked_instructions` in settings. Version 0.7.1 adds `GET /api/status` (the Status panel's rows and the failing count), `POST /api/status/refresh` (check the agent and whisper-server now), `GET /api/status/:kind/:id/errors` (a row's last 5 errors) and `POST /api/backups` (back up now; 409 while one is running). Version 0.8.0 adds the Melete endpoints under `/api/melete` (`GET /today`, `GET` and `PATCH /subjects/:id`, `POST /subjects/:id/enrollment`, `GET` and `PATCH /notes/:id`, `POST /notes/:id/regenerate` and `/retry`, `POST /questions/:id/drop`, `GET /review/next`, `POST /questions/:id/grade` and `/review`), the `purpose` query on `GET /api/prompt-profiles` (`summary` by default, or `linker`, `melete_questions`, `melete_grading`, `all`), the `melete_*` settings, and `default_folder` on jobs. Version 0.9.0 adds `GET /api/auth/google` (starts the Google sign-in; `returnTo` optional), `GET /api/auth/callback` (Google's redirect target), `POST /api/auth/signout`, `GET /api/me` (the signed-in user and their modules; 401 if signed out), `GET /api/me/vaults`, `POST /api/me/vault` and `POST /api/me/vault/new` (choose a vault), and the admin routes under `/api/admin` (`GET` and `POST /users`, `PATCH` and `DELETE /users/:id`, `POST /users/:id/reset-vault`, `GET /usage?month=YYYY-MM`). Version 0.9.1 adds no endpoints; `GET /api/melete/today` also returns `skipped_paths`, the vault paths the last scan couldn't read. Every other `/api` route needs a session cookie, every `POST`, `PUT`, `PATCH` and `DELETE` must be JSON (`415` otherwise), another user's resource is a `404`, and a module's routes are a `404` for a user without the module. The agent service has its own internal API for the server only (`GET /health`, `GET /v1/link/instructions`, `POST /v1/link`; bearer `AGENT_SECRET`) and no published port.

## Output formats

- **Markdown:** frontmatter with `title`, `source`, `channel`, `duration`, `transcribed`, `model` and `tags`, then paragraphs that each start with a timestamp. For YouTube videos the timestamp links to that moment in the video.
- **Article notes:** the same sections, with `author`, `site` and `published` (each only when known) in the front-matter instead of `channel` and `duration`, and no timestamps. Articles have no SRT or TXT.
- **SRT:** subtitle file, one cue per segment.
- **TXT:** plain text with no timestamps.

## Configuration

The server reads these environment variables. Empty values count as unset.

| Variable | Default | Docker (`docker-compose.yml`, Dockerfile) |
| --- | --- | --- |
| `PORT` | `3100` | `3100` |
| `WHISPER_URL` | `http://localhost:8178` | `http://host.docker.internal:8178` |
| `WORK_DIR` | `<OS temp dir>/mnemosyne` | `/tmp/mnemosyne` |
| `DATA_DIR` | `<OS temp dir>/mnemosyne-data` | `/data` (volume `mnemosyne-data`) |
| `BACKUP_DIR` | `<OS temp dir>/mnemosyne-backups` | `/backups` (bind mount of `BACKUP_HOST_PATH`) |
| `VAULTS_PATH` | `/vaults` | `/vaults` (bind mount of `VAULTS_HOST_PATH`) |
| `ADMIN_EMAIL` | required | from `.env`, required |
| `APP_ORIGINS` | required | from `.env`, required |
| `SESSION_DAYS` | `30` | from `.env`, default `30` |
| `DEFAULT_NOTE_FOLDER` | `Mnemosyne` | from `.env`, default `Mnemosyne` |
| `ANTHROPIC_API_KEY` | required | from `.env` |
| `SUMMARY_TIMEOUT_MS` | `300000` | default |
| `REVIEW_TTL_HOURS` | `24` | default |
| `CLEANUP_INTERVAL_MINUTES` | `15` | default |
| `WHISPER_MODEL` | `large-v3-turbo` | `${WHISPER_MODEL:-large-v3-turbo}` |
| `WEB_DIR` | unset (Vite serves the web app) | `/app/web` |
| `GOOGLE_CLIENT_ID` | required | from `.env`, required |
| `GOOGLE_CLIENT_SECRET` | required | from `.env`, required |
| `TOKEN_ENCRYPTION_KEY` | required | from `.env`, required |
| `AGENT_SECRET` | unset (linking off) | from `.env`, required |
| `AGENT_URL` | `http://localhost:8100` | `http://agent:8100` |
| `AGENT_TIMEOUT_MS` | `120000` | default |
| `LOG_LEVEL` | `info` | `${LOG_LEVEL:-info}`, for the app and the agent |
| `STATUS_CHECK_INTERVAL_MINUTES` | `2` | from `.env`, default `2` |
| `APP_TIME_ZONE` | `Asia/Singapore` | from `.env`, default as left |
| `MELETE_DAY_START_HOUR` | `4` | from `.env`, default `4` |
| `MELETE_REQUEST_RETENTION` | `0.9` | from `.env`, default `0.9` |
| `MELETE_GRADING_TIMEOUT_MS` | `20000` | from `.env`, default `20000` |
| `MELETE_GENERATION_TIMEOUT_MS` | `120000` | from `.env`, default `120000` |

- `LOG_LEVEL` is `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. Both services write one JSON object per line to the container's output, with a level and a time. A line about a job carries its `job_id` (the agent's lines for a link run carry it too), and the pollers' lines carry the feed or source. Follow one job with `docker compose logs mnemosyne agent | grep <job id>`. Request bodies, note and transcript text, prompts, email content and tokens are never logged. Under `pnpm dev` the server's output is pretty-printed.
- `STATUS_CHECK_INTERVAL_MINUTES` is how often the server checks the agent service and whisper-server in the background.
- The Melete variables are all optional. `APP_TIME_ZONE` (an IANA name such as `Asia/Singapore`) and `MELETE_DAY_START_HOUR` (0–23) decide when "today" starts for the new-questions-per-day limit. `MELETE_REQUEST_RETENTION` (above 0.7, up to 0.99) is the share of questions you aim to remember when they come back; higher means more reviews. The two timeouts bound one question-generation call and one grading call.
- `WORK_DIR` holds audio files while a job runs; the folder is emptied when the server starts.
- `WHISPER_MODEL` is only the label stored on each transcript (whisper-server doesn't report its model). Keep it in step with the model the agent runs.
- `WEB_DIR` is the folder with the built web app; when set, Express serves it.
- `DATA_DIR` holds `mnemosyne.db`; **Back up now** (Settings → Sources) writes a consistent copy to `BACKUP_DIR`, and [`docs/backups.md`](docs/backups.md) says what is backed up and how to restore. `VAULTS_PATH` must exist and be writable at startup, or the server exits with a message.
- `ADMIN_EMAIL` (lower-cased) is the one account that can sign in to an empty app. `APP_ORIGINS` lists the addresses the app is served at, comma-separated, as `scheme://host[:port]` with no path (for example `http://localhost:3100,https://mac.tailnet.ts.net`); a sign-in from any other address is refused with a 400, and each address needs its redirect URIs in Google ([`docs/google-cloud-setup.md`](docs/google-cloud-setup.md)). `SESSION_DAYS` (1–365) is how long a sign-in lasts without use. `VAULTS_PATH` is the folder that holds one vault folder per person; each person's vault is `VAULTS_PATH/<their folder>`.
- `DEFAULT_NOTE_FOLDER` is the folder in the person's vault that notes go to unless they pick another in the review screen. It is relative to the vault, is created when a note is first saved there, and must be a plain path such as `Notes/Videos` (no `..`, no leading `/`, no folder starting with a dot). The server never writes outside the vault, whatever folder is asked for.
- The three Google variables are required: they run sign-in and, if someone connects it, Gmail. `TOKEN_ENCRYPTION_KEY` must be 32 bytes in base64 (`openssl rand -base64 32`); any other value stops the server at startup with a message. The redirect URIs are derived from `APP_ORIGINS`, so `GOOGLE_REDIRECT_URI` and `VAULT_PATH` (and `VAULT_HOST_PATH` for Compose, now `VAULTS_HOST_PATH`) are gone from 0.9.0: a leftover `GOOGLE_REDIRECT_URI` or `VAULT_PATH` is ignored and logged as a warning at startup.
- `AGENT_SECRET` (at least 32 characters; `openssl rand -hex 32`) must be the same for the app and the agent service; in Docker one `.env` value feeds both. Without it the server starts with linking off and Settings says how to set it up. `AGENT_TIMEOUT_MS` is how long the server waits for one linking run; the agent's own run limit is 90 seconds. The agent service reads `ANTHROPIC_API_KEY`, `AGENT_SECRET` and `VAULTS_ROOT` (the vaults folder, mounted read-only; each request names the person's vault folder and the agent refuses anything that isn't a real folder directly inside it), plus optional limits named `AGENT_MAX_TURNS`, `AGENT_MAX_TOOL_CALLS`, `AGENT_MAX_OUTPUT_TOKENS`, `AGENT_RUN_TIMEOUT_SECONDS`, `AGENT_MAX_SUGGESTIONS`, `AGENT_LIST_NOTES_LIMIT`, `AGENT_SEARCH_HITS_LIMIT`, `AGENT_SEARCH_SNIPPET_CHARS`, `AGENT_READ_NOTE_CHARS` and `AGENT_LINK_TARGETS_LIMIT` (the defaults are in `apps/agent/src/mnemosyne_agent/config.py`).
- `ANTHROPIC_API_KEY` lives in `.env` only, never in the repo. In Docker, `.env` at the repo root feeds both compose and the container.
- For development, copy `apps/server/.env.example` to `apps/server/.env` and set `ANTHROPIC_API_KEY`, `ADMIN_EMAIL`, `APP_ORIGINS` (`http://localhost:5173`), the three Google variables and `VAULTS_PATH` (a folder that holds one folder per person; any folder works for trying it out). Add `http://localhost:5173/api/auth/callback` to the Google client for sign-in. `pnpm dev` loads it, and the integration tests load it too.
- **The agent service outside Docker.** It needs [uv](https://docs.astral.sh/uv/) and Python 3.14. Run `ANTHROPIC_API_KEY=… AGENT_SECRET=… VAULTS_ROOT=/path/to/vaults pnpm --filter @mnemosyne/agent dev` (port 8100, reloading), and put the same `AGENT_SECRET` and `AGENT_URL=http://localhost:8100` in `apps/server/.env`. The agent only reads vaults, so any copy of a vaults folder works. Stop the agent container first if it is running.

## Development

```sh
pnpm install
pnpm dev                                        # server on :3100, web on :5173 (proxies /api)
pnpm test                                       # unit tests, all packages (the agent's pytest included)
pnpm --filter web test:browser                  # real-browser tests (Chromium and WebKit)
pnpm --filter @mnemosyne/server test:integration  # real yt-dlp, ffmpeg and whisper-server
pnpm lint
pnpm typecheck
pnpm build
pnpm --filter @mnemosyne/agent exec uv run pytest -m docker   # builds the agent image and checks it (needs Docker)
pnpm e2e                                        # the whole stack against local fakes (needs Docker; slow)
```

`pnpm e2e` builds the Compose stack under its own project name and port (3101) with a temporary vault and backups folder, serves pages, a feed, Whisper's health and the Anthropic API from local fakes, runs the Playwright tests, signed in through a test-only session route that exists only in that stack (`E2E_TEST_SIGNIN`, refused outside `NODE_ENV=test`): an article through summary, linking and save; a feed and its inbox; the Status panel and **Back up now**; Melete; and a member who chooses a vault and sees only their own modules and data and tears everything down, including its volume. It never touches your running instance or the network. It is not part of `pnpm test`; run it at the end of each piece of work and before a release.

`pnpm --filter @mnemosyne/server fixture:gmail <messageId> <name> [display name]` saves a real email from the connected account as a test fixture in `apps/server/src/test-support/gmail/`, with your address, name and the links reduced to a host and a generic path. No test touches Gmail or the network; they use these fixtures and fakes.

Stop the container first (`docker compose stop`): the dev server and the container both use port 3100. Open <http://localhost:5173> while developing. The integration tests need whisper-server running; the Claude integration test also needs `ANTHROPIC_API_KEY` and is skipped without it.

Layout: `apps/server` (Express API, worker, tool clients, formatters), `apps/web` (React UI), `apps/agent` (Python vault agent service: read-only vault tools and the Claude linking agent), `packages/shared` (Zod schemas used by both), `ops/` (launchd plist and entrypoint).

## Stopping

```sh
docker compose stop
```

On a stop signal the server stops taking work and lets a running job finish, for up to 60 seconds, then exits. Docker allows 75 seconds before it kills the container. A second signal exits immediately: press Ctrl+C twice under `pnpm dev`, or run `docker compose kill` for the container. A killed job that was mid-transcription is marked failed on the next start; a job that was summarizing is resumed.

## Troubleshooting

- **Jobs fail at transcribing, but the container shows healthy.** The health check only covers the server, not whisper-server; the Status panel (Settings → Sources) shows whisper-server as Failing when it can't be reached. Check the agent with `launchctl print gui/$(id -u)/com.naresh.whisper-server` and `curl http://127.0.0.1:8178`, and read `~/Library/Logs/whisper-server.log`.
- **whisper-server isn't reachable from the container.** The container reaches it at `host.docker.internal:8178`, and the agent listens on `127.0.0.1`, which works through Docker Desktop. If `curl http://127.0.0.1:8178` fails on the Mac, the agent isn't running.
- **Port 3100 is already in use.** The container and `pnpm dev` use the same port. Run `docker compose stop` before `pnpm dev`, or stop the dev server before `docker compose up`.
- **The server exits at startup with a `VAULTS_PATH` message.** The vaults folder is missing or not writable. In Docker, check `VAULTS_HOST_PATH` in `.env` points at an existing folder that Docker Desktop is allowed to share.
- **`docker compose up` says to set `VAULTS_HOST_PATH`, or the app logs that it ignored `VAULT_PATH`.** You are upgrading from 0.8: see the release notes. `VAULT_HOST_PATH` is now `VAULTS_HOST_PATH` and points at the folder *around* your vault.
- **The sign-in page says you are not allowed.** The Google account isn't in the Admin tab (or was removed), or its email isn't verified at Google. The admin adds it there; the very first sign-in must be `ADMIN_EMAIL`.
- **Signing in says "This address isn't configured in APP_ORIGINS".** You opened the app at an address that isn't in `APP_ORIGINS` (for example the Tailscale one). Add it, restart, and add its redirect URIs in Google.
- **Every page asks you to sign in again, or sign-in loops.** The session cookie isn't being kept: check the address matches `APP_ORIGINS` exactly (including `https` for Tailscale), and that the browser accepts cookies for it.
- **"Choose your vault first" (409) or the page asks you to choose a vault.** You have not claimed a vault yet, or the admin used **Reset vault**. Choose one; nothing in the vault is touched.
- **"Your vault folder is missing".** The folder you chose is gone from the vaults folder (deleted, renamed, or `VAULTS_HOST_PATH` points somewhere else now). Restore or remount it, or choose another folder or create a new one on the vault page that appears. Check `VAULTS_HOST_PATH` first if every user sees it.
- **The Vault page lists no folders.** Every folder directly inside the vaults folder is already claimed, or the folder names aren't valid (lowercase letters, digits and hyphens). Create a new vault, or ask the admin to reset someone's.
- **After upgrading to 0.9.0 the app is empty and there is a `pre-0.9-…db` file in the backups folder.** Expected: 0.9 starts a fresh database and keeps the old one there ([`docs/v0.9.0/release-notes.md`](docs/v0.9.0/release-notes.md)).
- **A note shows "The agent service could not find your vault".** The agent couldn't open that person's vault folder under `VAULTS_ROOT`; check the Compose mount and that the folder still exists.
- **A job shows "summary failed".** The transcript is kept; the reason is on the job (`GET /api/jobs/:id`). Retry with `POST /api/jobs/:id/retry-summary`.
- **An article job fails with "needs a login or is paywalled" or "Not an article page".** The server fetches pages without logging in or running scripts. Use **Paste text** on the failed job and paste the article's text.
- **A feed shows a warning.** Its last check failed (the message says why, for example the site answered 500). It is retried at the normal interval; **Check now** in its menu retries at once.
- **Gmail shows Reconnect needed.** Google no longer accepts the stored access. The reason is shown. If it happens about a week after connecting, the Google Cloud app is still in *Testing*: publish it to **In production** (see the setup), then press **Reconnect**. It also happens after you remove Mnemosyne in your Google account's third-party access, or after `TOKEN_ENCRYPTION_KEY` changes.
- **After approving Gmail in development you get a connection error or a Google redirect error.** Under `pnpm dev` open the app at `http://localhost:5173`, with that address in `APP_ORIGINS`, and add `http://localhost:5173/api/gmail/oauth/callback` to the Google client.
- **Google says "Error 400: redirect_uri_mismatch".** The redirect URI the app sent isn't in the Google client's list. It is `<the address in the browser>/api/auth/callback` for sign-in or `…/api/gmail/oauth/callback` for Gmail, and must match character for character ([`docs/google-cloud-setup.md`](docs/google-cloud-setup.md)).
- **A Gmail source shows "Label not found in Gmail".** A label it uses was deleted in Gmail. Edit the source and pick the labels again; the rest keep working.
- **An email won't summarize ("too little text" or "too long").** Some emails are mostly images or links. They stay in the inbox; open the email from its link, or dismiss it.
- **Settings says linking isn't set up.** `AGENT_SECRET` is empty or shorter than 32 characters in the server's environment. Set it in `.env` (`openssl rand -hex 32`) and run `docker compose up -d --build`. Notes summarized in the meantime have no link suggestions; open one in review and use **Run linking**.
- **The Status panel shows the agent service as Failing, or a note shows "Agent service unreachable".** The server can't reach the agent. Check `docker compose ps` (the `agent` container should be healthy) and `docker compose logs agent`; the agent exits at startup with a message if `ANTHROPIC_API_KEY`, `AGENT_SECRET` or `VAULTS_ROOT` is wrong. While it is down, new summaries go to review without suggestions; use **Run linking** or **Retry linking** once it is back. Outside Docker, check that `AGENT_URL` points at the running `pnpm --filter @mnemosyne/agent dev`.
- **A note shows "Agent service rejected the secret".** The app and the agent have different `AGENT_SECRET` values. Use one value for both and restart both.
- **"Agent service timed out".** A run took longer than `AGENT_TIMEOUT_MS` on the server side. Retry linking; a very large vault or a slow model can need it raised (the agent has its own 90-second run limit, `AGENT_RUN_TIMEOUT_SECONDS`).
- **A link suggestion is marked Stale.** You edited the note after linking and the phrase it pointed at is gone or has changed. **Add to Related** puts the link under `## Related` instead, or reject it.
- **Suggestions look wrong or miss notes.** The agent works from note titles, tags and text search, not embeddings. Edit the linker prompt in Settings → Linking (it applies to the next run), then **Re-run linking**.
- **The Settings item in the drawer has a warning badge.** Something is Failing. Open Settings → Sources: the Status panel lists it, and opening the row shows its last 5 errors. It clears by itself after the next successful check (**Check now** on a feed or source, or open the panel to re-check the services).
- **`docker compose up` says to set `BACKUP_HOST_PATH`.** Add the absolute path of a folder on your Mac to `.env` (see `.env.example`) and create the folder.
- **Back up now fails.** The row shows the reason. Check that the folder exists and is writable by Docker Desktop (`docker compose logs mnemosyne` has the same line), and that the disk isn't full. A failed backup leaves no file.
- **The server exits at startup with "This database is from a newer version of Mnemosyne".** The database was written by a newer release than this build. Restore an older backup ([`docs/backups.md`](docs/backups.md)) or build the newer version.
- **After a restore, Gmail shows Failing.** `TOKEN_ENCRYPTION_KEY` in `.env` differs from the one that encrypted the stored token. Click **Reconnect**; nothing else is affected.
- **Where do I find what happened to one job?** Take its ID from the page address (`?job=<id>`) and run `docker compose logs mnemosyne agent | grep <id>`. Raise `LOG_LEVEL` to `debug` in `.env` and restart for more detail.
- **Choosing a learning root says "A file is in the way of folder …".** A file, not a folder, has that name in your vault. Pick another name, or rename the file. A learning root that doesn't exist yet is created when you save it (0.9.1).
- **A folder is missing from the folder picker, or Melete says it couldn't read some folders.** The app can't read it (no permission, or it changed while being read), so it leaves it out of the picker and skips it in the scan; the server log names it (`docker compose logs mnemosyne | grep -i skipped`, with the vault-relative path and the error code, `EACCES` for permissions). Notes inside a folder Melete couldn't read are left as they were, with their questions still in review, and the notice on the Melete page lists the paths. Fix the folder's permissions on the host (for example `chmod 755`); the notice goes after the next scan that can read it.
- **Melete shows no subjects.** Subjects are the folders directly inside the learning root. Add a folder there; notes placed directly in the root are ignored.
- **A note shows Failed or "Note is too long for question generation".** The reason is on the note. A long note over 60,000 characters must be split. Other failures (a Claude error, no usable questions) can be retried with **Retry**.
- **"Couldn't grade this one; rate it yourself".** The grading call failed or timed out (`MELETE_GRADING_TIMEOUT_MS`). Rate the question yourself; the review is recorded either way.
- **Open in Obsidian says the vault isn't found.** The link uses the name of your vault folder, which is what Obsidian calls a vault it opened as a folder. If you opened a parent folder in Obsidian, or renamed the vault there, the name differs; open your vault folder itself as the vault. `OBSIDIAN_VAULT_NAME` in `.env` is no longer read (0.9.1) and is logged as ignored at startup; delete it.
- **The phone can't reach the app.** The port is published on `127.0.0.1` only, so the phone needs Tailscale; see [`docs/phone-access.md`](docs/phone-access.md) (it also covers a sleeping Mac).
- **A YouTube video fails with HTTP 403.** The server retries once after three seconds. If it still fails, submit the URL again later. The container updates yt-dlp each time it starts, so `docker compose restart` can also help.

## Status and roadmap

Version 0.10.0. A small multi-user tool: Google sign-in, an admin and members, one vault and one set of data per person, one job at a time across everyone (taking turns), all in one SQLite database.

Possible next steps:

- Freelance job alerts from Gmail (Upwork, Freelancer.com): Claude extraction into a postings dataset and a Freelance jobs page. Deferred from 0.6.0 until real alert emails exist to build against (ADR 0041).
- OPML import and export of feeds, and a per-feed model.
- Lazy-load the note editor (the web bundle is about 1.5 MB).
- A per-model view of the usage the Admin tab shows (it has the month and category today).
- Create concept notes (stubs, or written by Claude) from popular unresolved concepts, and re-link existing notes in bulk.
- Link notes that are both still in review.
- More endpoints on the vault agent service: a tutor and a business-idea validator.
- Remember the last-used folder, or pick a folder by tag.
- Live progress with Server-Sent Events instead of polling.
- Query past notes through an MCP server.
