# 0107. Express moves to `@anthropic-ai/sdk` 1.x

- Status: Accepted
- Date: 2026-11-10

## Context
After 1.0, major dependency bumps are allowed one per release (v0.11 decision). On 2026-11-10, five Node packages were a major behind: `@anthropic-ai/sdk` (0.137 → 1.7), `ts-fsrs` (5 → 6), `typescript` (6 → 7), `jsdom` (30 → 31) and `@types/node` (24 → 26, follows the Node runtime). The Python side needed minor updates only.

The TypeScript SDK 1.0.0 (2026-10-21) shipped with Anthropic API version 2026-10-21, the first new API version since 2023-06-01; the Python SDK 2.0 shipped the same day. The agent already runs Python `anthropic` 2.6, so the linker uses the new API version while every Express call still uses the old one.

## Decision
- The 1.2 major bump is **`@anthropic-ai/sdk` to the latest 1.x**, in the kick-off checkpoint after the gate (ADR 0106) and before any agent work.
- The task reads the official migration guide for API version 2026-10-21 first. Reported changes: sampling parameters (`temperature`, `top_p`, `top_k`) are refused, the key goes out as a bearer token, and `MessageParam` is a union. No Claude call in the server sets sampling parameters (the only `temperature` is in the Gemini client), so the expected work is type fixes in `claude.client.ts` and `anthropicModels.client.ts`.
- After the gate is green, `test:integration` is run once by hand, since it is the only suite that calls the real API. If the guide lists a break beyond these, Claude Code stops and asks.
- `ts-fsrs` 6 and TypeScript 7 each get a release of their own later. `jsdom` 31 waits for a later release.

## Consequences
- Express and the agent send the same API version.
- 1.2 has no other major bump.

## Alternatives considered
- **`ts-fsrs` 6:** changes the scheduler behind every stored review state; needs its own release with a check against real review data.
- **TypeScript 7:** a toolchain change across every package; its own release.
- **`jsdom` 31:** test-only and trivial, but held to keep one major per release.
