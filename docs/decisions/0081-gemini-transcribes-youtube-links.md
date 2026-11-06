# 0081. Gemini transcribes YouTube links; video is YouTube-only

- Status: Accepted (supersedes 0079 and 0080; supersedes 0074's OpenAI and audio-preparation parts — its no-timestamps decision stands); amended by 0083 (Developer API, not Vertex)
- Date: 2026-11-06

## Context
On the VM, yt-dlp first got HTTP 403 on YouTube's media servers (ADR 0079 added a PO token provider), then "Sign in to confirm you're not a bot": YouTube flags the VM's datacenter address. Cookies or a residential proxy would keep racing YouTube's checks. Google's Gemini accepts a public YouTube URL as video input and fetches the video itself, so the VM never contacts YouTube. On Vertex AI the YouTube video must be public (or owned by the calling account), and one YouTube URL is allowed per request (Vertex model reference, checked 2026-11-06). A forum report (2026) says `videoMetadata` start/end offsets on YouTube URLs clip frames but not audio, billing the whole video's audio per clip.

## Decision
- **Gemini on Vertex AI** in the `atlas` project transcribes YouTube videos from the link. Auth is the VM's service account (Application Default Credentials; `gcloud auth application-default login` on the Mac) through `google-auth-library`, already a dependency; requests use `fetch` (no new package). The model is `GEMINI_MODEL`, set to the current Flash model on the day.
- **One request per video**, low media resolution, a prompt for a verbatim transcript without commentary or timestamps. **No clipping into chunks.** If the response stops at the output cap, the partial transcript is kept and marked truncated.
- **Title, channel and duration** come from the YouTube Data API v3 (`videos.list`, 1 quota unit), with a restricted API key in Secret Manager (`youtube-api-key`), replacing `openai-api-key`.
- **Video is YouTube-only.** Other video hosts are refused with "Only YouTube videos are supported".
- **Removed:** yt-dlp and its config, the bgutil plugin, `pot-provider` and `POT_PROVIDER_URL`, ffmpeg/ffprobe and `prepareAudio`, the OpenAI client and settings, the `downloading` and `converting` job steps, and the `whisper`, `backup` and `pot_provider` health kinds (a migration).
- **Cost** is recorded per run from Gemini's input and output tokens. The Status row becomes "Transcription (Gemini)".
- `atlas-vm` gets `roles/aiplatform.user`, which can only be granted project-wide, an exception to ADR 0077's per-resource rule.

## Consequences
- YouTube jobs work from the VM without cookies, proxies or a Google account tied to downloads.
- A much smaller app image (no ffmpeg, no yt-dlp) and one fewer vendor (OpenAI).
- Unlisted, private, members-only and age-restricted videos fail; Vimeo, Dailymotion, TikTok and Twitch are no longer supported.
- Transcript quality and length depend on Gemini; very long videos may be truncated.

## Alternatives considered
- **Cookies from a secondary account.** Fragile, risks the account, and the address is still flagged.
- **A residential proxy.** A paid vendor whose addresses also get flagged.
- **Download through a device at home over Tailscale.** Needs an always-on home device.
- **Keep yt-dlp + OpenAI for other video sites.** Machinery kept for sites Naresh doesn't use, likely blocked on the VM too.
- **Clip long videos into chunks.** Bills the full audio per chunk on YouTube URLs.
