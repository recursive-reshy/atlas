# 0002. Local transcription with whisper.cpp

- Status: Superseded by 0074
- Date: 2026-10-14

## Context
This is a personal tool running on an Apple Silicon Mac (24 GB unified memory). Transcription should be accurate, free per use, and private. Relying only on YouTube's own captions would limit the app to YouTube and give unpunctuated, lower-accuracy text.

## Decision
Transcribe audio locally with **whisper.cpp**, using the **`large-v3-turbo` model, q5 quantized**, served by `whisper-server` (its built-in HTTP server).

## Consequences
- Accuracy close to `large-v3` at several times the speed; Metal GPU acceleration on Apple Silicon.
- No API costs, no audio leaves the machine.
- Works for any source that yields audio, not just YouTube.
- Model file (~0.5 GB) must be downloaded and kept outside the repo (e.g. `~/whisper-models/`).
- Enabling VAD (voice activity detection) is recommended to reduce hallucinated text during silence or music.

## Alternatives considered
- **faster-whisper:** same model weights and equivalent accuracy, but it is Python and best on NVIDIA GPUs. whisper.cpp is a native binary with Metal support, a cleaner fit for this Mac and a TypeScript stack.
- **Hosted APIs (OpenAI, AssemblyAI, Deepgram):** simpler, but cost money per use and send audio off the machine. Unnecessary for personal use.
- **YouTube captions only:** fast and free, but YouTube-only, unavailable on some videos, and lower quality. May be added later as an optional fast path.
