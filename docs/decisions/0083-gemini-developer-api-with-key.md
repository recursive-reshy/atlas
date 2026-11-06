# 0083. Gemini through the Developer API with an API key, not Vertex AI

- Status: Accepted (amends 0081 and 0082)
- Date: 2026-11-06

## Context
ADR 0081 chose Gemini on Vertex AI with the VM's service account. It worked on the Mac, where Application Default Credentials are Naresh's own Google login. On the VM (task 9.7, 2026-11-06), with the service account's token from the metadata server:
- a text-only `generateContent` to `gemini-3.8-flash` on Vertex returned **200**;
- the same request with a YouTube `fileData` part returned **401** "Request is missing required authentication credential", with the same valid token.

Vertex's YouTube input requires the video to be public or owned by the signed-in account, and evidently needs an end-user credential to make that check; a service account isn't one. The Gemini Developer API (`generativelanguage.googleapis.com`, the AI Studio API) documents YouTube URLs as input. The same request there, from the VM, with an API key created in AI Studio against the `atlas` project, returned **200** with a transcript.

## Decision
- **Gemini calls go to the Developer API** (`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`) with header `x-goog-api-key`. Request and response shapes (`fileData`, `generationConfig`, `usageMetadata`, `finishReason`) stay as ADR 0082 set them, unless the Developer API's reference differs (checked in the task).
- **The key** is `gemini-api-key` in Secret Manager, created in AI Studio against the `atlas` project, on a **paid** tier (billing on), so inputs are not used to improve Google's products and YouTube input isn't capped at 8 hours a day.
- **Health check:** `GET …/v1beta/models/{model}` with the key (free).
- **Removed:** `GOOGLE_CLOUD_PROJECT`, `GEMINI_LOCATION` (to `IGNORED_VARIABLES`), the ADC/`google-auth-library` use in the Gemini client, the Mac's ADC mount in `compose.local.yml`, and the project-wide `roles/aiplatform.user` grant (ADR 0077's per-resource rule holds again). `GEMINI_MODEL` stays (`gemini-3.8-flash`).
- Prices come from the Developer API's paid-tier price list.

## Consequences
- YouTube transcription works from the VM.
- One more API key in Secret Manager (six secrets until `openai-api-key` is deleted, then five plus YouTube Data and Gemini).
- No service-account path to Gemini; if the key leaks, it can spend on Gemini only (restrict it to the Generative Language API in the console).

## Alternatives considered
- **Vertex with Naresh's own OAuth refresh token on the VM.** Ties the server to a personal login and its expiry.
- **Back to downloading audio.** Blocked by YouTube (ADR 0081).
