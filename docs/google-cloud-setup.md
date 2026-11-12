# Google Cloud setup

Atlas uses one Google OAuth client for three things (ADR 0061): **signing in** (everyone, with `openid email profile`), **reading Gmail** (optional, per person, read-only with `gmail.readonly`) and **reading Google Calendar** (optional, per person with Themis, read-only; ADR 0108). The setup is done once, in the [Google Cloud console](https://console.cloud.google.com/). The console's menus change from time to time; the names below are those of the Google Auth Platform at the time of writing, so if one no longer matches, trust Google's own help.

Nothing is stored at Google beyond the client itself. Atlas never changes a mailbox or a calendar.

The hosted setup keeps this client in the same Google Cloud project as the VM, called `atlas` ([`deploy.md`](deploy.md#1-google-cloud-resources)); the client belongs to the project you create it in, so create it there, not in an older project.

## 1. Create the client

1. **Use the `atlas` project** you created for the VM (or create one with that name if you are only running Atlas on your Mac).
2. **Enable the Gmail API:** APIs & Services → Library → Gmail API → Enable. (Sign-in alone doesn't need it; skip this if nobody will connect Gmail.)
   Also **enable the Google Calendar API** (Library → Google Calendar API → Enable) if anyone will connect a calendar.
3. **Branding:** Google Auth Platform → Branding. Give the app a name and your email as the support and developer contact. Google asks for a homepage and a privacy policy link; any page you control will do (this is a personal app).
4. **Audience:** choose **External**.
5. **Data Access:** add the scopes `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile` (shown as `openid email profile`), and, if anyone will connect Gmail, `https://www.googleapis.com/auth/gmail.readonly`. For Calendar add the two read-only scopes `https://www.googleapis.com/auth/calendar.calendarlist.readonly` (to list the calendars to choose from) and `https://www.googleapis.com/auth/calendar.events.readonly` (to read events). Atlas never asks for write access.
6. **Clients → Create client → Web application.** Add the authorized redirect URIs listed in [step 2](#2-authorized-redirect-uris). Copy the client ID and client secret.

## 2. Authorized redirect URIs

Every address in `APP_ORIGINS` needs **three** redirect URIs in the client: one for sign-in, one for Gmail and, if you use Calendar, one for Calendar. They must match character for character, including `http` or `https` and the port. For these origins:

| Origin | Used for | Sign-in redirect URI | Gmail redirect URI | Calendar redirect URI |
| --- | --- | --- | --- | --- |
| `http://localhost:3100` | the Mac, Docker | `http://localhost:3100/api/auth/callback` | `http://localhost:3100/api/gmail/oauth/callback` | `http://localhost:3100/api/calendar/oauth/callback` |
| `http://localhost:5173` | development (`pnpm dev`) | `http://localhost:5173/api/auth/callback` | `http://localhost:5173/api/gmail/oauth/callback` | `http://localhost:5173/api/calendar/oauth/callback` |
| `https://<machine>.<tailnet>.ts.net` | the VM: phones, the Mac and other people, over Tailscale ([`phone-access.md`](phone-access.md)) | `https://<machine>.<tailnet>.ts.net/api/auth/callback` | `https://<machine>.<tailnet>.ts.net/api/gmail/oauth/callback` | `https://<machine>.<tailnet>.ts.net/api/calendar/oauth/callback` |

Google accepts `http` only for `localhost`; any other address must be `https`. The Tailscale address is the one `tailscale serve` prints on the VM.

The app builds the redirect URI from the address the browser used, and refuses an address that isn't in `APP_ORIGINS` (a 400 saying so). Adding a new address therefore takes two steps: add it to `APP_ORIGINS` (in `.env` on the Mac, in `/etc/atlas/atlas.env` on the VM) and restart, and add its redirect URIs here.

Calendar also needs `CALENDAR_REDIRECT_URI` set to the one Calendar URI of the address people use (`https://<your origin>/api/calendar/oauth/callback`); without it the Calendar section in Settings says it isn't configured. See [`configuration.md`](configuration.md).

## 3. Who can sign in

Only people the admin has added in **Settings → Admin** (and the account named by `ADMIN_EMAIL`, on the first sign-in). Google decides who can *reach* the consent screen; Atlas decides who is *let in*. A Google account that isn't on the list sees a plain "not allowed" page.

How you set the **Audience** matters for the first part:

- **In production** (required on the VM): anyone with a Google account can reach the consent screen, and Google shows an "unverified app" warning that you continue past; you don't need to submit the app for verification. Refresh tokens don't expire, which Gmail and Calendar need.
- **Testing:** only the Google accounts listed as **test users** can sign in at all, so add every person you add in Admin (including yourself). **Gmail and Calendar break every 7 days in this mode**: Google expires refresh tokens of apps in Testing after a week, and Settings shows **Reconnect needed** (for Calendar, **Reconnect** keeps the time already imported and the rules). Publish the app (Audience → **Publish app**) if anyone uses Gmail or Calendar.

## 4. Where the values go

On the Mac, put them in `.env` (the repo root for Docker, `apps/server/.env` for development):

```sh
ADMIN_EMAIL=you@gmail.com
APP_ORIGINS=http://localhost:3100,https://<machine>.<tailnet>.ts.net
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
TOKEN_ENCRYPTION_KEY=...   # from: openssl rand -base64 32
```

`TOKEN_ENCRYPTION_KEY` encrypts the stored Gmail refresh tokens and signs the short-lived sign-in cookie. Keep it as safe as the secret: a copy of the database is useless without it, and a lost or changed key means everyone has to reconnect Gmail. The server won't start without the Google variables, `ADMIN_EMAIL` or `APP_ORIGINS`.

On the VM, `ADMIN_EMAIL`, `APP_ORIGINS` and `GOOGLE_CLIENT_ID` go in `/etc/atlas/atlas.env`, and the two secrets, `google-client-secret` and `token-encryption-key`, in Secret Manager ([`deploy.md`](deploy.md#1-google-cloud-resources)); the service reads them into memory when it starts, and nothing is written to the VM's disk.

`GOOGLE_REDIRECT_URI`, which earlier versions used, is no longer read; a leftover value is ignored and logged as a warning.

## 5. Check it

Restart (`docker compose up -d` on the Mac, `sudo systemctl restart atlas` on the VM), open the app and press **Sign in with Google** with the `ADMIN_EMAIL` account. You land in the app (after choosing a vault, the first time). Then, in **Settings → Sources**, **Connect Gmail** sends you through Google again for the read-only access, and **Connect Google Calendar** (for a user with Themis) does the same for Calendar, after which you choose the calendar and the day to import from.

- **"Error 400: redirect_uri_mismatch"**: the redirect URI the app sent isn't in the client's list. Check the address in the browser's bar against the table above.
- **"Access blocked: Atlas has not completed the Google verification process"** or "This app is blocked": the app is in *Testing* and this Google account isn't a test user; add it, or publish the app.
- **"This address isn't configured in APP_ORIGINS"**: add the address to `APP_ORIGINS` and restart.
- **Sign-in lands on the "not allowed" page**: the email isn't in the Admin tab (or isn't verified at Google).

## 6. Gemini and the YouTube Data API

Videos are transcribed by Gemini through the Gemini Developer API, which is given the YouTube link and fetches the public video itself (ADRs 0081, 0083). This needs no OAuth client; it needs two API keys, both in the same `atlas` project. (Vertex AI was tried first and is no longer used: from the VM it refused YouTube input when called with the service account.)

1. **Enable the APIs:** APIs & Services → Library → **Generative Language API** and **YouTube Data API v3** → Enable (`generativelanguage.googleapis.com`, `youtube.googleapis.com`).
2. **A YouTube Data API key** (title, channel and length of a video; one quota unit a call): APIs & Services → Credentials → Create credentials → API key, then restrict it to **YouTube Data API v3**. This is `YOUTUBE_API_KEY`.
3. **A Gemini API key** in [Google AI Studio](https://aistudio.google.com/apikey): Get API key → Create API key, against the `atlas` project. Put the project on a **paid** tier (link billing there): on the free tier your inputs may be used to improve Google's products and YouTube input is capped at 8 hours a day. Then, in the Cloud console, restrict the key to the **Generative Language API**. This is `GEMINI_API_KEY`.
4. **Settings.** On the Mac, in `.env`:

   ```sh
   GEMINI_MODEL=gemini-3.8-flash   # the current Flash model
   GEMINI_API_KEY=...
   YOUTUBE_API_KEY=...
   ```

   On the VM, `GEMINI_MODEL` goes in `/etc/atlas/atlas.env` and the two keys in the `gemini-api-key` and `youtube-api-key` secrets ([`deploy.md`](deploy.md#1-google-cloud-resources)).

Only public videos work: a private, unlisted, members-only or age-restricted video fails before Gemini is asked, and other video sites are refused. On the paid tier Google sets no limit on the length of a video, but a very long one may fill Gemini's output limit and be cut short (the review screen says so). The cost is per token (an estimate is on the Admin tab's Usage table; check the Google Cloud console for the real figure).
