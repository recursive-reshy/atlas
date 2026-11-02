# 0004. App in Docker, Whisper native on the host

- Status: Superseded by 0074
- Date: 2026-10-14

## Context
The app should start with one action from Docker Desktop. But Docker on macOS runs containers in a Linux VM with no access to the Metal GPU, so whisper.cpp inside a container would be CPU-only and several times slower.

## Decision
- **The app (Express serving the built React app) runs as a single Docker container** on `localhost:3100`, defined in `docker-compose.yml`.
- **whisper-server runs natively on the Mac** with Metal acceleration, bound to `127.0.0.1:8178`.
- whisper-server is a **launchd agent that starts at login** and is kept alive (`ops/com.naresh.whisper-server.plist`). With 24 GB of RAM, the ~1 GB idle footprint is acceptable.
- The server reaches Whisper through the `WHISPER_URL` environment variable: `http://host.docker.internal:8178` in Docker, `http://localhost:8178` in native development.

## Consequences
- One-click start via Docker Desktop, with full GPU speed for transcription.
- Whisper uses memory even when the app isn't in use. Accepted for now.
- The server only ever talks to Whisper over HTTP, so the engine can be swapped (or run elsewhere) without app changes.
- Whisper models are mounted/stored on the host, never baked into the image.
- In development (`pnpm dev`), Docker isn't needed at all.

## Alternatives considered
- **Everything in Docker, CPU-only:** simplest packaging, but much slower transcription.
- **No Docker:** fastest and simplest at runtime, but loses the Docker Desktop on/off switch and isolation.
- **Start script that launches Whisper on demand:** frees memory when idle, but the Docker Desktop button can't start host processes, so a script would become the entry point. Revisit if memory becomes a concern.
