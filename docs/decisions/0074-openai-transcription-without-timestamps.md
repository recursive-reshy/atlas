# 0074. Transcription with OpenAI's gpt-transcribe, without timestamps

- Status: Accepted (supersedes 0002 and 0004, and 0034); OpenAI and audio-preparation parts superseded by 0081
- Date: 2026-11-02

## Context
Videos were transcribed by whisper.cpp's whisper-server running natively on the Mac (ADRs 0002, 0004), returning segments with start and end times. Those times fed clickable timestamps in the review screen, caret sync between transcript and editor (ADR 0034), the `.srt` download, and the seconds Claude attached to each key point and quote, rendered in the note as links to that moment on YouTube. 0.10.0 moves the app to a small cloud VM where a ~1 GB whisper image and its CPU load don't fit.

Claude has no speech-to-text, so a second AI vendor is needed. On 2026-11-02, OpenAI's file-transcription guide recommends `gpt-transcribe` ($0.0045/min), which returns text and detected languages only. The only OpenAI model with segment or word timestamps, `whisper-1`, is deprecated along with the gpt-4o transcribe models, shutting down on 2027-02-26. Google's Chirp 3 returns utterance timestamps but costs about 3.5× as much ($0.016/min). Uploads are limited to 25 MB.

## Decision
- **OpenAI `/v1/audio/transcriptions` with `gpt-transcribe`**, called with `fetch` (no SDK), model configurable (`TRANSCRIPTION_MODEL`), key in `OPENAI_API_KEY`.
- **Audio** is encoded once as mono 16 kHz Opus/WebM at 24 kbit/s (about 11 MB an hour). Over 24 MB it is split near silences into equal parts, transcribed in order with the previous text's tail as the `prompt`, and joined.
- **Video transcripts are plain text.** No segments, no timestamps, no caret sync, no `.srt`. A video summary has the article's shape (key points and quotes as plain strings), so notes no longer link to moments on YouTube. Notes already in the vault are untouched. Naresh chose this over keeping timestamps.
- **whisper-server is deleted**, not kept as an option; local development uses the same API.
- **Each transcription is costed** from the video's duration in `transcription_runs` and shown in the admin usage rollup.

## Consequences
- No transcription hardware on the VM or the Mac; one more API key and vendor bill.
- About $0.27 an hour of video.
- A simpler review screen and summary contract; the caret-sync code and its browser test go.
- If OpenAI later adds timestamps to a current model, they can come back with a new ADR.

## Alternatives considered
- **`whisper-1` now, migrate before February 2027.** A drop-in, but built on a model with a known end date.
- **`gpt-transcribe` with chunk-start timestamps.** Coarse (about 30 s), more code, and the note links would point at chunk starts.
- **Google Chirp 3.** Real timestamps and no extra vendor (same GCP project, service-account auth), but about 3.5× the price for a feature Naresh decided he doesn't need.
- **Keep whisper-server on the VM.** Too heavy for an e2-small.
