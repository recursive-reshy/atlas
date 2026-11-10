# Plan — Checkpoint B: Security fixes (v1.1.1)

## Context
Closes the three gaps in the PRD: the server fetches any URL with no address check, a removed user's vault folder can be claimed by the other user, and ingested text enters Claude prompts unmarked. Plus two small hardenings (cookie payload shape, `/api/health` exposure). Follows TRD §3 (3.1–3.5). Branch `release/1.1.1`; one commit per task, staged by name, pushed after each. Tests first (red → green) in every task. ADRs 0096, 0097 are written first in their tasks, added to `docs/README.md` and the task's ADR column. Each ADR says whether it changes the TRD.

## 2.1 SSRF guard (ADR 0096)
- **ADR first:** `docs/decisions/0096-address-guard-for-fetched-urls.md` (ranges, repeat after redirect, DNS-rebind residual risk, `FETCH_ALLOW_PRIVATE` test-only switch from TRD §3.1).
- **Tests first** in `apps/server/src/clients/http.client.test.ts` (existing file, uses fake fetch; mock `node:dns/promises` lookup): one test per range (127/8, `::1`, `0.0.0.0`, `::`, 10/8, 172.16/12, 192.168/16, 169.254/16, `fe80::/10`, `fc00::/7`, IPv4-mapped `::ffff:10.0.0.1`); non-http(s) scheme; hostname resolving to a private address; hostname with several addresses where one is private; public → private redirect; public host passes. All refusals are `ValidationError("That address can't be fetched")`. Red reason: no guard, fetch is called.
- **Code:** in `clients/http.client.ts`, an `assertPublicAddress(url)` run at the top of each hop (before `fetch`, so also after each redirect) using `dns.lookup(host, { all: true })`; IP-literal hosts are checked directly. `ValidationError` is rethrown untouched by the catch (currently every other error becomes `UnreachableError`). Range check as small pure helpers (reuse `isPrivateIpv4` / `isUniqueLocalIpv6` from `middleware/requestOrigin.ts` if they can be exported cleanly; otherwise local helpers).
- `config.ts`: `FETCH_ALLOW_PRIVATE` (`'1'`), refused outside `NODE_ENV=test` like `E2E_TEST_SIGNIN`; set in the e2e compose override; documented in `apps/server/.env.example` (`envExample.test.ts` keeps the two in step) and `docs/configuration.md`.
- Tests that cover article fetch, feed preview/check/discovery: confirm they go through `fetchResource` (read call sites); add one route-level test (article job for `http://169.254.169.254/` fails with the new message; a feed check records it as the feed's error). Existing tests that fetch fake local hosts get the allow switch in test setup if they need it.
- Update `docs/architecture.md` (fetching paragraph).

## 2.2 Released vaults (ADR 0097)
- **ADR first:** `0097-released-vault-folders.md` (rename to `.released/<vault_dir>-<YYYYMMDDTHHmmss>`, admin moves back by hand, rename failure logged not fatal).
- **Tests first** through the admin routes (`controllers/admin.controller.ts` / `services/admin.service.ts` tests, temp `VAULTS_PATH`): delete user → folder gone from its path, present under `.released/`, absent from `listUnclaimedVaults`; reset vault likewise; second release in the same second does not collide (assert name format, suffix on clash); rename failure still succeeds and logs `error` with folder name. Red: folder stays in place.
- **Code:** `services/vaultOnboarding.service.ts` (owner of `listUnclaimedVaults`) gains `releaseVaultFolder(vaultsPath, vaultDir, now)`; `deleteUserAccount` and `resetVault` call it after the DB change succeeds. `.released/` created on first use, UID-owned like the rest.
- `docs/deploy.md`: three lines on freeing a released folder. Update `architecture.md` accounts paragraph.

## 2.3 Untrusted content in prompts (needs Naresh's wording)
- **Stop first:** show Naresh (a) the one-sentence addition to each locked instruction and (b) where each lands, before any code. Calls (TRD §3.3): summarizer video + article (`clients/claude.client.ts` `toUserMessage`, line 59), agent linker request (`apps/agent`, note body), Melete generate / map / syllabus, grading (learner's typed answer). I will find the exact files by grep (`apps/server/src/clients`, `services/melete*`, `apps/agent`) when this task starts, and name them in the proposal.
- **Tests first:** pure-function tests on the built messages: content is inside `<source_content>\n…\n</source_content>`; a source that itself contains `</source_content>` cannot close the block (decision for Naresh: neutralise the closing tag vs. ignore; I recommend neutralising, one line); locked-instruction test asserts the new sentence is present. Integration test untouched. Agent side: Pydantic/pytest, and since the agent request contract does not change shape, no ADR 0043 mirror edit.
- Locked-prompt hash/lock files, if any exist for prompts, are checked for what the change touches.

## 2.4 Cookie payload
- **Test first** (`services/auth.service.test.ts`): a correctly signed payload of the wrong shape (e.g. `{}`, `exp` string) → `'failed'`. Red: currently cast and `pending.exp < now` yields a non-failure or throws.
- **Code:** `Pending` becomes a Zod schema (`state`, `verifier`, `returnTo`, `origin`, `exp`); `readPending` uses `safeParse` (auth.service.ts:42, 133). The local schema stays in the server (not a cross-app contract, so not in `@atlas/shared`).

## 2.5 Health route
- **Tests first** (`routes/health.routes.test.ts`): loopback and private peer (`10.x`, `192.168.x`) get 200; a public peer address gets the standard 404. Supertest peers are loopback, so the untrusted case needs the peer address controlled (inject via a small test app wrapper or stub `req.socket.remoteAddress`).
- **Code:** export `isTrustedProxy` from `middleware/requestOrigin.ts`; `health.routes.ts` answers 404 through the existing not-found path for an untrusted peer. `deploy.sh`, Compose healthcheck and e2e connect locally, unchanged.

## Verification (each task before ticking)
`pnpm --filter @atlas/server test`, `lint`, `typecheck`; plus `apps/agent` pytest/ruff/mypy for 2.3; root `pnpm test` for doc guards. At the end of the checkpoint: `deploy/` node tests and `pnpm e2e` (Docker; confirms `FETCH_ALLOW_PRIVATE` keeps the fakes reachable). Tick each task in `tasks.md` with a log line (task id, hash, moved/deleted tests — none expected).

## Checkpoint report
Hashes per task; test/lint/typecheck per folder + e2e; ADRs 0096 and 0097 and whether they change the TRD (0096 and 0097 follow it; the `FETCH_ALLOW_PRIVATE` switch is already in TRD §3.1); anything deferred.

## After approval
Save to `docs/v1.1.1/plans/checkpoint-b.md`, tick checkpoint B's Plan cell (link the file), commit `docs: plan checkpoint B`, push, start 2.1.
