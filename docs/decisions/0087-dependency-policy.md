# 0087. Minor and patch updates only before 1.0; majors one per release after; images pinned by digest

- Status: Accepted
- Date: 2026-11-07

## Context
0.11 freezes a known-good state for 1.0. `pnpm -r outdated` on 2026-11-07 showed four majors behind (`typescript` 7, `ts-fsrs` 6, `@anthropic-ai/sdk` 1.x, `jsdom` 31) and many minors. Base images are referenced by tag, so a rebuild can change them silently.

## Decision
- 0.11 refreshes dependencies within their current majors only, exact pins included.
- Majors wait until after 1.0, one per release, each with its own tests. `@anthropic-ai/sdk` 1.x first.
- `ts-fsrs` 6 is checked for stored card-state changes before it is taken, and gets a migration if it needs one.
- `@types/node` follows the Node runtime's major, never ahead.
- Every third-party base image and Compose image is pinned as `tag@sha256:…`, and a test enforces it.
- Each release's checkpoint report flags any dependency or runtime whose support ends within about eight months.

## Consequences
- Rebuilds are repeatable.
- Security fixes that only exist in a new major are a stop-and-ask, not a silent bump.

## Alternatives considered
- Taking the majors in 0.11, the last release allowed to break things: none is needed, and each adds risk to the freeze.
