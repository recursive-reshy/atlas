# Checkpoint C plan: Phase 4 (dependencies), v0.11.0

## Context
Checkpoint C freezes a refreshed, repeatable dependency set for 1.0 (ADR 0087, TRD §4): minors/patches within current majors, exact pins moved, and every third-party image pinned by digest with a guard test. No new ADR expected. Nothing runs against the VM. Majors stay deferred (`typescript` 7, `ts-fsrs` 6, `@anthropic-ai/sdk` 1.x, `jsdom` 31, `@types/node` 26).

Facts found (`pnpm -r outdated`, today):
- Server: `google-auth-library` 11.3.1→11.3.3, `turndown` 7.2.4→7.2.5, `linkedom` 0.18.13→0.18.15 (all exact pins).
- Web: `react-router` 8.5.1, `@mdxeditor/editor` ^4.3.3→4.5.0, `@mui/x-tree-view` 9.17.0, `@tanstack/react-query` 5.106.1, `@vitejs/plugin-react` 6.2.1, `vite` 8.3.6; `@vitest/browser-playwright` 5.0.5→5.1.0 and `playwright` 1.64.1→1.65.0 (exact).
- Shared/all: `vitest` ^5.0.5→5.1.0, `typescript-eslint` 8.72.1, `eslint` 10.14.0. E2E: `@playwright/test` 1.64.1→1.65.0 (exact, must match `playwright`).
- Exact pins named by the TRD but already current: `feedsmith`, `@googleapis/gmail`, `@mozilla/readability`, `@types/turndown` (confirm, no change if so).
- Agent `pyproject.toml` uses `>=` floors; `uv lock --upgrade` moves `uv.lock` (anthropic, fastapi, pytest, ruff, others).
- Images: `Dockerfile` (2× `node:24-slim`), `e2e/fakes/Dockerfile` and `deploy/sync/Dockerfile` (`node:24-slim`), `apps/agent/Dockerfile` (`python:3.14-slim`), `compose.prod.yml` (2× `litestream/litestream:0.5.17`). Our own images (`atlas-*:local`, `${REGISTRY}/…`) are exempt.
- Existing tests that assert the unpinned strings and must change: `scripts/dockerfile.test.mjs` (`/^FROM node:24-slim$/m`), `scripts/compose.test.mjs` (`litestream/litestream:0.5.17` equality, ~line 152), and possibly `deploy/litestream/litestream.test.mjs`. Each is listed in the log line.
- Tools present: `docker`, `uv`. `knip` is run with `pnpm dlx` (no new dependency).

## 4.1 — Server, shared, e2e refresh
- Tests first: none new; the existing suites are the net. Record the baseline (server/shared/e2e lint, typecheck, tests) before touching versions.
- Change: `pnpm up` within ranges for `vitest` (server, shared, web together), `typescript-eslint`, `eslint`; move exact pins `google-auth-library`, `turndown`, `linkedom`, and `playwright`/`@playwright/test` (web + e2e together) to the versions above; edit `package.json` exact pins by hand so they stay exact; `pnpm install`; review the lockfile diff for surprise majors.
- Check: root `pnpm test`, lint, typecheck; server build. Read each bumped package's changelog for breaking notes (context7/web), note any in the log.
- Playwright bump changes the browser build the web `test:browser` uses: run `pnpm --filter @atlas/web exec playwright install` if needed (local only).
- Commit `chore(0.11-4.1): refresh server, shared and e2e dependencies`.

## 4.2 — Web refresh and MDXEditor 4.5
- Order inside the task: bump `@mdxeditor/editor` first alone, run web tests + `test:browser` (red here = a real 4.5 change, fix in `apps/web`), then the rest (`react-router`, `@mui/x-tree-view`, `@tanstack/react-query`, `@vitejs/plugin-react`, `vite`, `@vitest/browser-playwright` to 5.1.0 matching `vitest`).
- Tests first: only if 4.5 breaks something — write the failing test for the break, then fix.
- Manual check with the real app (`run` skill / `pnpm dev`): toolbar, source toggle, dark mode, properties panel, light and dark screenshots saved to the scratchpad and described in the log (not committed).
- Check: web test, test:browser, lint, typecheck, build.
- Commit `chore(0.11-4.2): refresh web dependencies and MDXEditor 4.5`.

## 4.3 — Agent
- `cd apps/agent && uv lock --upgrade`; keep `pyproject.toml` floors (raise a floor only if the lock's resolved version needs it; tell Naresh if I do).
- Check: `uv run ruff check`, `ruff format --check`, `pyright`, `pytest`; also `uv lock --check`. Contract export/golden examples must be unchanged (ADR 0043) — verify git shows no diff there.
- Unused-dependency check by hand: compare `[project].dependencies` against `import`s in `src/` (no new tool).
- Commit `chore(0.11-4.3): agent lock refresh`.

## 4.4 — Digest pins, guard test, knip, support-end list
- Tests first: new `deploy/images.test.mjs` (picked up by root `node --test "deploy/**/*.test.mjs"`). It walks the tracked Dockerfiles and compose files (via `git ls-files`), and fails on any `FROM` (stage aliases such as `FROM build` excluded) or `image:` that isn't `tag@sha256:<64 hex>`, unless the image is ours (starts with `atlas-`, or contains `${REGISTRY`). Self-tests of the checker with synthetic good/bad lines. Red first: current files fail.
- Resolve digests with `docker buildx imagetools inspect <tag> --format '{{json .Manifest}}'` (the multi-arch index digest, so both the Mac and the VM's architecture work); pin `node:24-slim`, `python:3.14-slim`, `litestream/litestream:0.5.17`. This reads a public registry only; it touches no VM or GCP.
- Update the 3 existing tests above to expect the pinned form (digest read from a shared regex, not hard-coded).
- Check that `docker compose config`-based tests in `compose.test.mjs` still pass, `docker build` of the app image once locally to prove the pinned base works.
- `pnpm dlx knip` once; remove anything unused after 0.10's removals only if clearly unused (otherwise list it).
- Support-end list for the report: Node 24 (LTS, ends April 2028), Python 3.14 (ends Oct 2030), Litestream 0.5, Debian (slim base) release, and any package in the lockfile flagged deprecated; anything ending before 2027-07 is called out. I'll verify dates rather than rely on memory.
- Update `docs/deploy.md`/root `CLAUDE.md` only if they describe the tag-only form; add a short "how to bump a pinned image" note to `docs/deploy.md` (how to get the new digest).
- Commit `feat(0.11-4.4): images pinned by digest`.

## End of checkpoint
Run root `pnpm test`, lint, typecheck; web `test:browser`; agent Ruff/Pyright/pytest; `deploy/` tests; `pnpm e2e` (Docker running). Report per CLAUDE.md. Tick Plan cell and statuses/log in `tasks.md` as each task lands.

## Open points for Naresh
1. `# syntax=docker/dockerfile:1` at the top of the Dockerfiles pulls the BuildKit frontend image by tag. I propose leaving it unpinned (the guard looks at `FROM` and `image:` only, as the TRD says). Say if you want it pinned too.
2. If a bump needs a range change or a breaking-change fix beyond what the TRD names, I'll stop and ask rather than defer silently.
