# Checkpoint F plan — Atlas v0.10.0, phase 8 (tasks 8.1–8.3): YouTube on the VM

## Context
On the VM yt-dlp solves YouTube's JS challenge, then gets HTTP 403 from `googlevideo.com`; verbose shows `PO Token Providers: none`. ADR 0079 / TRD §11 fix it with the open-source bgutil PO-token provider: an HTTP server container plus a yt-dlp plugin in the app image, with the server passing the provider's address to yt-dlp. 7.1 and 7.2 are ticked (commit 6230fd3). 8.3 needs Naresh (release and deploy). Rules as in earlier checkpoints: tests first and watched failing, one commit per task, files staged by name, pushed; Claude runs no `gcloud`, registry push or VM command itself.

## Vendor facts verified today (2026-11-04)
| TRD §11 "verify" item | Result | Source |
| --- | --- | --- |
| Current release | **2.0.2**, published 2026-10-07; one release asset, `bgutil-ytdlp-pot-provider.zip` | GitHub releases API |
| Image tag | `brainicism/bgutil-ytdlp-pot-provider:2.0.2` exists (amd64 + arm64); also `2.0.2-node`, `2.0.2-deno`. Plain tag = Node. Pin `2.0.2` | Docker Hub |
| Image bind address | Node stage runs `CMD ["--host","0.0.0.0"]`, `EXPOSE 4416`, user `node`, **no HEALTHCHECK**. (Run natively, the server binds only localhost, so we must not override the CMD) | repo `server/Dockerfile` |
| Ping endpoint | `GET /ping` → JSON `{ "server_uptime": number, "version": string }`. Requests carrying an `Origin` header get 403; our server-side fetch sends none | `server/src/main.ts` |
| Extractor argument | `--extractor-args "youtubepot-bgutilhttp:base_url=http://host:4416"`. **The older `youtube:getpot_bgutil_baseurl` is not what 2.x documents**; use the new name | plugin README |
| Min yt-dlp | 2025.05.22 (we track latest) | plugin README |
| Plugin folders | yt-dlp README: system-wide `/etc/yt-dlp/plugins/` and `/etc/yt-dlp-plugins/`; user `~/.config/yt-dlp/plugins/`; **next to the executable `<dir>/yt-dlp-plugins/`**; `PYTHONPATH` **does not apply to PyInstaller builds**. Layout `<package>/yt_dlp_plugins/…`, and `.zip` archives with `yt_dlp_plugins` at their root are supported. So the release zip is dropped **unchanged** into `/etc/yt-dlp/plugins/` | yt-dlp README |
| Not stated anywhere | whether the standalone `yt-dlp_linux` binary really loads a zip from `/etc/yt-dlp/plugins/` | verified by an image check (below), not assumed |

Corrections to TRD §11: extractor-arg name (above); and one thing it omits — see "Decision needed".

## Decision needed (not in TRD or ADR 0079)
`health_status` and `health_errors` have a `CHECK ( kind IN ( 'agent','whisper','backup','transcription','replication' ) = user_id IS NULL )` (`apps/server/src/repositories/database.ts:454,468`). The new `pot_provider` kind would be rejected by SQLite, and the VM's database has **already applied migration 10**, so editing migration 10 changes nothing there.
**Recommendation:** add **migration 11** (rebuild both tables with `'pot_provider'` added, same copy pattern as migration 10). Consequences: the server makes a `pre-migration/` copy when the VM starts 0.10.0 again, and a database at schema 11 is refused by a build that only knows 10 (a rollback to a pre-F build needs the database restored, which the runbook already says for schema changes). The Mac's dev database upgrades the same way. On approval I'll record this as ADR 0080 (changes TRD §11/§4) when 8.2 is committed. Alternative (not recommended): record this check under the existing `agent` kind, which mislabels it.

## 8.1 Plugin in the app image, `POT_PROVIDER_URL` → `--extractor-args` (ADR 0079)
Files: `Dockerfile`, `apps/server/src/config.ts` (+ `config.test.ts`), `apps/server/src/clients/ytDlp.client.ts` (+ test), `.env.example`, `apps/server/CLAUDE.md` if it lists env vars.
Tests first (red → green):
1. `config.test.ts`: `POT_PROVIDER_URL` unset/empty → `config.potProviderUrl === null`; a valid URL is kept; an invalid one fails startup (same `emptyAsUnset` + `z.url().optional()` pattern as `LITESTREAM_METRICS_URL`, `config.ts:127,171`).
2. `ytDlp.client.test.ts`: with the setting null, the args stay exactly as today (existing test unchanged); with it set, args contain `'--extractor-args', 'youtubepot-bgutilhttp:base_url=http://pot-provider:4416'` before the `--` separator and the URL stays last. The client reads `config.potProviderUrl` (module mock, like `health.service.test.ts`). `downloadAudio`'s signature and its one caller (`video.adapter.ts`, which already retries once on a 403) are untouched.
3. Dockerfile: a build arg `BGUTIL_VERSION=2.0.2` (single place for the version, also named in `compose.prod.yml` — a test asserts both agree). Download `https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/${BGUTIL_VERSION}/bgutil-ytdlp-pot-provider.zip` to `/etc/yt-dlp/plugins/` (curl is already installed and purged in the same RUN layer; do it before the purge), mode 644, root-owned. Does not touch `/etc/yt-dlp.conf` or the entrypoint's yt-dlp updates (they replace only the binary).
4. Image check, `scripts/` test (skipped without Docker, like the Compose tests): build the app image target, run `yt-dlp -v --version` (no network use beyond the build) and assert the verbose output lists the bgutil provider under `PO Token Providers`; if the standalone binary does **not** load the zip from `/etc/yt-dlp/plugins/`, fall back in this order and record which one worked in the log: (a) `/usr/local/bin/yt-dlp-plugins/` (next to the executable), (b) unzip the zip into `/etc/yt-dlp/plugins/bgutil-ytdlp-pot-provider/`. Red first: the check fails before the Dockerfile change.
Checks: server `pnpm test/lint/typecheck`, root tests. Commit `feat(0.10-8.1): bgutil plugin in the app image and POT_PROVIDER_URL`.

## 8.2 `pot-provider` service, Status row, docs (ADRs 0050, 0079)
Files: `compose.prod.yml`, `deploy/vm/atlas.env.example` (only if a setting is needed — none planned), `packages/shared/src/status.ts` (+ test), `apps/server/src/repositories/database.ts` (migration 11 + test), `apps/server/src/clients/potProvider.client.ts` (new, + test), `apps/server/src/services/health.service.ts` and `status.service.ts` (+ tests), `apps/web/src/components/StatusPanel/statusLabels.ts` (+ test), `scripts/compose.test.mjs`, `docs/deploy.md`, `README.md`, root and server `CLAUDE.md`, `docs/README.md`, ADR 0080 (if the migration is approved).
Tests first:
1. Shared: `AppHealthKind` gains `'pot_provider'`; `status.test.ts` lists it.
2. Database: migration 11 test — a database at version 10 with rows in both tables upgrades, keeps its rows, accepts `pot_provider` with a null user and rejects it with a user (mirror the migration 10 tests); `SCHEMA_BASE + migrations.length` is now 11.
3. `potProvider.client.ts`: `checkPotProvider(url)` → `GET <url>/ping`, 2 s timeout, ok when 200 and the body parses as `{ server_uptime, version }` (Zod); a fake HTTP server in the test for 200, 500, bad JSON and a hang (same style as `litestreamMetrics.client.test.ts`). The detail is the provider's version.
4. `health.service`: `runServiceChecks` adds `checkPotProvider` only when `config.potProviderUrl !== null` and records `{ kind: 'pot_provider', id: 'default' }` through `recordCheck`; `pruneHealth` drops the row when unconfigured (the `replication` pattern, `health.service.ts:197`).
5. `status.service`: admin-only row "YouTube tokens (PO provider)", present only when configured, off/ok/failing like Replication; a non-admin never sees it. `statusLabels.ts`: `pot_provider: 'Service'`.
6. `compose.test.mjs` (prod render): service `pot-provider` with `image: brainicism/bgutil-ytdlp-pot-provider:2.0.2`, `init: true`, `restart: unless-stopped`, no `ports`, no volumes, healthcheck present; the app has `POT_PROVIDER_URL=http://pot-provider:4416`; only `app` still publishes a port; the image version equals the Dockerfile `BGUTIL_VERSION` default; the local/e2e render has neither the service nor the variable.
Implementation notes:
- `compose.prod.yml` service: no CMD override (keeps `--host 0.0.0.0`); healthcheck `["CMD","/usr/local/bin/node","-e","fetch('http://127.0.0.1:4416/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]` (the image has no curl; Node is its entrypoint) so `up --wait` confirms it. The app does not `depends_on` it: a down provider shows as a failing row and YouTube downloads fail with 403, but nothing else stops.
- Resource note: one more Node process on the e2-small; `docker stats` check moves into release check 9.1.
- Docs: runbook gets the provider (what it is, how to see its logs with `dc logs pot-provider`, upgrading it together with the plugin via `BGUTIL_VERSION`, and a troubleshooting entry "YouTube 403 / YouTube tokens row failing"); README gets the `POT_PROVIDER_URL` row, Status paragraph and troubleshooting line; root `CLAUDE.md` gets one sentence in the architecture paragraph.
Checks: server, web and shared tests/lint/typecheck, root `node --test`, `docker compose config` for prod, and `pnpm e2e` (required from checkpoint F on; it must stay green with no provider configured).
Commit `feat(0.10-8.2): pot-provider service and YouTube tokens status row`. Tick, log.

## 8.3 Release and deploy again, with Naresh (ADR 0079)
No code unless something fails. Steps (each command shown to Naresh first; he runs or approves it):
1. Mac: `deploy/release.sh --dry-run 0.10.0`, then the real run — the same tag is rebuilt. **Question for you:** re-push `0.10.0`, or release `0.10.1`? Pushing over the tag works but erases the exact image that was deployed; the docs plan says 0.10.0 isn't tagged yet, so I'd re-push 0.10.0. Say if you prefer 0.10.1 (the package versions would then change).
2. VM: `deploy.sh 0.10.0` (the runbook's `--files` form so the new `compose.prod.yml` reaches `/opt/atlas`). Migration 11 runs on start; expect a `pre-migration/` copy.
3. Checks: `dc ps` shows `pot-provider` healthy; `dc exec app yt-dlp -v --version` lists the bgutil provider; Status shows "YouTube tokens" green; **a YouTube video job completes.**
4. If YouTube still returns 403: stop, do not add workarounds; write down what `yt-dlp -v` and `dc logs pot-provider` show, and propose cookies from a secondary Google account as a new ADR (per ADR 0079).
Tick 8.3 and the checkpoint only after the video job completes. Log the outcome and any runbook corrections.

## Verification summary
- Per task: failing tests seen red for the right reason, then green; lint and typecheck for each touched folder; `shellcheck` unaffected.
- End of F: `pnpm test`, `pnpm lint`, `pnpm typecheck` per folder, `pnpm e2e` (Docker must be running), prod Compose config renders, VM video job completes.
- Checkpoint report: tasks with hashes, results per folder, ADR 0080 (changes TRD §11 extractor argument and adds migration 11), and follow-ups (yt-dlp/plugin version drift; cookies if tokens stop being enough).

## Open questions for you (answer on approval)
1. Migration 11 for the new health kind — approve (recommended)?
2. Re-push `0.10.0` or release `0.10.1` for 8.3?
