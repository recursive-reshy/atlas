# 0082. Gemini request details found when checking the vendor facts

- Status: Accepted (changes TRD §12.1 and §12.10; does not change ADR 0081); amended by 0083 (Developer API, not Vertex)
- Date: 2026-11-06

## Context
TRD §12 marked several Vertex AI facts "Verify". They were checked on 2026-11-06 against Google's Vertex AI documentation and, for the model-get path, one free `GET` with the Mac's Application Default Credentials. Three of them differ from what the TRD assumed.

## Decision
- **Model check path.** `GET https://aiplatform.googleapis.com/v1/publishers/google/models/{model}` (regional hosts use `{location}-aiplatform.googleapis.com`). It takes **no project or location**, which the TRD's wording suggested; it answered 200 with `launchStage: GA` for `gemini-3.8-flash`. It is free.
- **Thinking.** `gemini-3.8-flash` accepts `thinkingLevel` `LOW`, `MEDIUM` (default) or `HIGH`; **`MINIMAL` is rejected with a validation error**. The client sends `thinkingConfig: { thinkingLevel: "LOW", includeThoughts: false }`, replacing the TRD's "off or minimal". Thinking tokens bill as output, so the run records `candidatesTokenCount + thoughtsTokenCount`.
- **"Long" video.** The model page states a video limit of about **45 minutes with audio**. The release check for "a long (over an hour) video" in TRD §12.10 becomes "the longest public video the model accepts, about 45 minutes"; a video over an hour is expected to fail or be truncated and is noted in the release log, not treated as a failure of the release.

## Also recorded (no change to the TRD)
- Model `gemini-3.8-flash`, location `global` (the model page lists `global` and the multi-regions `us` and `eu`; there is no single-region location), `maxOutputTokens` 65,536.
- `generationConfig.mediaResolution = MEDIA_RESOLUTION_LOW` is sent; the model page documents 70 tokens per video frame and no setting, so it may change nothing for this model.
- Prices (`GEMINI_PRICES`) are **not confirmed from Google**: its pricing page could not be read. They are the figures price trackers list on 2026-11-06 ($0.75 per million input tokens, $3.75 per million output) and are marked unverified in code; one tracker reports a rise on 2027-01-01. Cost is an estimate either way.
- The `global` location means Google chooses where a request is processed.

## Consequences
- The status check costs nothing and needs only the model name.
- A transcript of a video much over 45 minutes may be truncated or refused; the review screen says so when it is truncated (9.3).
