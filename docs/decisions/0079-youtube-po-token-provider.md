# 0079. YouTube downloads on the VM use a PO token provider

- Status: Superseded by 0081
- Date: 2026-11-04

## Context
On the VM, yt-dlp reads a video's page and solves YouTube's JavaScript challenge, then gets **HTTP 403** on the media request to `googlevideo.com` (seen 2026-11-04 with yt-dlp 2026.10.26; its verbose log shows `PO Token Providers: none`). YouTube increasingly requires a proof-of-origin (PO) token on media requests, especially from datacenter addresses; the same download works from the Mac's home connection. The PRD had deferred yt-dlp workarounds (cookies, proxy) to a later release; 0.10.0 isn't tagged yet, so the fix goes in now.

yt-dlp has a PO Token Provider framework (since 2025.05.22). The open-source `bgutil-ytdlp-pot-provider` supplies tokens from a small HTTP server (Docker image `brainicism/bgutil-ytdlp-pot-provider`, default port 4416) through a yt-dlp plugin. It needs no Google account and costs nothing.

## Decision
- **A `pot-provider` service** in `compose.prod.yml`, pinned image, internal network only, no published port.
- **The matching plugin, pinned to the same version, in the app image** in a system yt-dlp plugin folder, so the standalone yt-dlp binary loads it.
- **The server passes the provider's address to yt-dlp** when `POT_PROVIDER_URL` is set (it is, on the VM); unset on the Mac and in tests, where yt-dlp runs as today.
- **An admin Status row** ("YouTube tokens") checks the provider answers, only when configured.
- **Cookies and a residential proxy stay deferred.** If tokens alone don't fix the 403, the next step is cookies from a secondary Google account, decided in a new ADR.

## Consequences
- One more small container on the e2-small (a Node server).
- Depends on community software tracking YouTube changes; plugin and server must be upgraded together, and yt-dlp is already updated on every start.
- Video jobs work on the VM without tying a Google account to the app.

## Alternatives considered
- **Cookies first.** Ties a Google account to automated downloads (YouTube can flag it) and often still needs a PO token for this 403.
- **A residential proxy.** Costs per GB and adds a vendor.
- **The provider's script mode inside the app container.** Needs the provider's source and its Node build in the app image; the HTTP server keeps it separate and swappable.
- **Run videos only on the Mac.** Defeats the point of the move.
