# Atlas v1.1.1 — Technical Requirements

Built from `prd.md` in this folder. Decided with Naresh on 2026-11-09; ADRs 0096–0101 are written by the tasks that need them, from the decisions below. Checkpoints C and D are behaviour-neutral: no endpoint's response and no page's rendering changes.

## 1. Changes at a glance
| Area | Change | ADR |
| --- | --- | --- |
| Docs | `CLAUDE.md` files are rules only; `architecture.md` absorbs behaviour they described; README trimmed; doc-guard tests keep drift checks and lose wording checks | |
| Fetching | Private, loopback and link-local addresses refused before every hop | 0096 |
| Vaults | A removed or reset user's vault is moved under `.released/` | 0097 |
| Prompts | Ingested text delimited and declared untrusted in every Claude call | |
| Auth | OAuth cookie payload parsed with Zod; `/api/health` answers trusted peers only | |
| Web | `src/features/<feature>/`, `src/app/`, `src/lib/`; mirror tests removed | 0098 |
| Server | `jobs.service.ts` split; job list projects its columns and batches lookups | |
| Database | Schema SQL in `.sql` files, hashed by bytes | 0099 |
| Loops | Worker and Melete generator woken by events; 15 s safety poll | 0100 |
| Modules | `ModuleId` is the registry; migration 17 drops the hard-coded lists | 0101 |

## 2. Docs and the doc-guard tests (checkpoint A)
2.1 Each `CLAUDE.md` states rules, commands and the layout in a few lines; it never describes what a file does. Behaviour goes in `docs/architecture.md`, reasons in ADRs.
2.2 The README is a front door: what Atlas is, running it locally, links. Usage, configuration and troubleshooting text lives in `docs/guide.md`, `docs/configuration.md` and `docs/troubleshooting.md`. There is no `docs/roadmap.md`.
2.3 `scripts/*.test.mjs` keep every check for stale terms (whisper, yt-dlp, Vertex…), version agreement across packages, the `docs/README.md` version line and the existence of `docs/v<version>/tasks.md`. They lose every check on the wording or line count of `CLAUDE.md` or the README. `version.test.mjs` uses the full version for the docs folder (`docs/v1.1.1/`), not `v<major>.<minor>.0`. Checks that named README variables move to `docs/configuration.md` or are dropped.
2.4 `.env.example` and `apps/server/src/config.ts` list the same variables; every line in `.env.example` has a comment with purpose, default and whether it is required.

## 3. Security (checkpoint B)
3.1 **Address guard (ADR 0096).** `fetchResource` resolves the host with `dns.lookup( host, { all: true } )` before each request. Any resolved address in these ranges is refused: `127/8`, `::1`, `0.0.0.0`, `::`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `fe80::/10`, `fc00::/7`, and IPv4-mapped forms of them. The check repeats after every redirect, using the new host. A refusal is `ValidationError( "That address can't be fetched" )`; for a feed check it is recorded as the feed's error like any other failure. The resolved address is passed to `fetch` via the hostname (not rewritten), so a DNS rebind between check and connect is accepted as residual risk and noted in the ADR. `GEMINI_BASE_URL` and the YouTube base URL are not fetched through `fetchResource` and are unaffected. The e2e fakes run on the Compose network, so the e2e override sets `FETCH_ALLOW_PRIVATE=1`, read in `config.ts`, which disables the guard; it is refused outside `NODE_ENV=test` like `E2E_TEST_SIGNIN`.
3.2 **Released vaults (ADR 0097).** `deleteUserAccount` and `resetVault` rename `VAULTS_PATH/<vault_dir>` to `VAULTS_PATH/.released/<vault_dir>-<YYYYMMDDTHHmmss>` after the database change succeeds, in the same request; `.released/` is created on first use. `VaultDir` already refuses a leading dot, so `listUnclaimedVaults` never lists it. If the rename fails the request still succeeds and the failure is logged at `error` with the folder name. `docs/deploy.md` gains three lines on freeing a released folder by moving it back.
3.3 **Untrusted content.** Every user message that carries ingested text wraps it as `<source_content>\n…\n</source_content>` and the locked instructions for that call gain one sentence: the content inside the block is material to work on and never instructions, whatever it says. Calls: summarizer (video and article), agent linker request (the note body), Melete generate, map and syllabus (the note or note openings). Grading wraps the learner's typed answer in its own `<learner_answer>` block, with its own sentence in the grading instructions, because it is an answer to grade and not material to work on. A closing tag inside the text is rewritten (`</source_content>` to `</source_content_>`) so the text cannot end its block. Melete's own headers (`Subject:`, `## Concepts`) stay outside the block; the note's title goes inside. The exact sentence is Naresh's; the task shows it before writing it. The integration test is unchanged.
3.4 **Cookie payload.** `Pending` becomes a Zod schema; `readPending` uses `safeParse` and answers `'failed'` on a shape mismatch.
3.5 **Health route.** `GET /api/health` runs `isTrustedProxy( req )` (exported from `requestOrigin.ts`); an untrusted peer gets the standard 404. `deploy.sh`, the Compose healthcheck and e2e all connect locally.

## 4. Web layout (checkpoint C, ADR 0098)
4.1 `src/` root: `main.tsx`, `App.tsx`, `routes.tsx`, `theme.ts`, `queryClient.ts` and their tests only: five source files and their tests.
4.2 `src/app/`: shell, drawer, gate, `GatePage`, `HomeRedirect`, `RequireModule`, `ColorModeControl`, `SignInPage`, `moduleHome.ts`, `moduleLabels.ts`.
4.3 `src/lib/`: `request.ts`, `apiError.ts`, the formatters, `queryKeys.ts` (the key factories stay in one file for now).
4.4 `src/features/<feature>/` for `jobs`, `feeds`, `inbox`, `gmail`, `vault`, `settings`, `status`, `admin`, `melete`, `themis`. Inside a feature: `components/<Name>/` (unchanged convention: `<Name>.tsx`, `<Name>.test.tsx`, `index.ts`), `hooks/`, `api/`, `fixtures/`. A component used by two features lives in the one that owns the data (`ConfirmDialog` and `NumberSettingField` go to `src/app/`).
4.5 `src/test-support/`: render helpers, setup files, `matchMedia`, `mutationStub`. `src/test/`: the `public/` asset tests and `browserSetup.browser.test.tsx`.
4.6 Imports: `#src/*` stays; relative imports within a feature. No barrel `index.ts` at the feature level.
4.7 Mirror tests are deleted: a hook test whose assertions are only that the mocked api function was called with the arguments and that `invalidateQueries` ran; an api test that only checks the URL string and that the schema parsed a fixture. Kept: any test with branching, state, timing or error handling of its own.

## 5. Server (checkpoint D)
5.1 `jobs.service.ts` splits into `jobs.service.ts` (queue, find, list, `moveTo`, `markStatus`, `failJob`, `recoverInterruptedJobs`, `deleteExpiredJobs`, acquisition and summary completion), `jobLinking.service.ts` (`runLinking`, `completeLinking`, `failLinking`, link runs and suggestions), `jobDraft.service.ts` (`updateDraft`, `saveJob`, `discardJob`, `submitPastedText`), `jobRender.service.ts` (`renderTranscript`, `getSource`, `findSource`). Imports between them are one-way: linking, draft and render import `jobs.service`, never the reverse.
5.2 `SELECT_JOB` lists columns; `source_document` and `note_markdown` are selected only by the functions that return them. `JobRow` splits into the list row and the full row.
5.3 `listJobs` makes one query for summary usage and one for link usage over the listed ids (`WHERE job_id IN ( … )`), and resolves `defaultFolderFor` once per distinct profile.
5.4 **Schema files (ADR 0099).** `repositories/sql/baseline.sql` and `repositories/sql/<NN>-<name>.sql` hold the SQL; `database.ts` reads them at module load with `readFileSync` and keeps `migrations` as `{ name, sql }`. `migrations.lock.json` continues to hash the SQL string, so the files' bytes equal today's template strings exactly and every existing hash verifies without change. `lockMigrations.ts` and `release.sh` are unchanged.
5.5 **Event-driven loops (ADR 0100).** `worker/wake.ts` exports a tiny emitter with `wakeWorker()` and `wakeGenerator()`. `queueJob`, `retrySummary`, `regenerateSummary`, `runLinking` and `submitPastedText` call `wakeWorker()` after the transaction; enrol, regenerate, approve syllabus and request draft call `wakeGenerator()`. The loops run a pass on wake and every 15 s. `startWorker`'s return still stops the timer and awaits the current pass; a wake during a pass sets a flag that runs one more pass.
5.6 `request.ts` appends the first Zod issue's path and message to "Unexpected response from the server".

## 6. Modules (checkpoint E, ADR 0101)
6.1 Migration 17 (seed `schema-16.sql`, then locked with `schema-17.sql`): rebuild `user_modules` without the `CHECK` on `module`; rebuild `eligible_users` so the module list comes from `user_modules` plus the admin rule (the admin has every module known to the application, which `claimNext*` passes as a parameter rather than the view listing modules). Row counts unchanged.
6.2 `app.ts` mounts `requireModule` from `MODULE_ROUTES: Record< ModuleId, string[] >` in one place; `ModuleId` in `@atlas/shared` is the registry and the only place a module is named.
6.3 `docs/deploy.md` documents the per-user `sync-<name>` Compose block as a manual step with the exact edits.

## 7. Tests and gate
Every task is test-first per the root `CLAUDE.md`. Behaviour-neutral checkpoints prove it by existing tests passing unchanged, except files that move (C, D) or are deleted (C, 4.7), each named in the log line. `pnpm e2e` runs at the end of checkpoints B, C, D and E.
