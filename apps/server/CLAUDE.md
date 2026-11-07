# apps/server

Express API for Atlas. It owns the SQLite job store, the worker that runs jobs one at a time (transcribe, then summarize), the sweeper that deletes expired jobs, the clients for Gemini, the YouTube Data API, Claude and the Obsidian vault, and the formatters that render transcripts, summaries and notes. The root `CLAUDE.md` covers the workflow, precedence, cross-app rules, git and secrets; this file does not repeat them.

The relevant ADRs are 0003–0009, 0012, 0014, 0015, 0020–0022, 0023, 0027–0032, 0054, 0058 and 0072 in `docs/decisions/`. Read the ones a task lists before changing behaviour they describe. If a task conflicts with an ADR, stop and report it; don't pick one.

## Stack

- Node 24 LTS, ESM, TypeScript `strict`.
- Express 5, Zod.
- pnpm workspaces. Shared contracts come from `@atlas/shared`.
- Vitest and Supertest.
- `tsc` builds `src/` to `dist/`, and production runs `node dist/src/server.js`. In development, `tsx` runs the source directly.
- better-sqlite3 for the job store, `@anthropic-ai/sdk` for summaries, `ts-fsrs` for Melete's scheduling.
- External services: the Gemini Developer API (ADR 0083; plain `fetch`, an API key in the `x-goog-api-key` header), the YouTube Data API, the Claude API, and the vault folder on disk. No tool runs on the PATH: yt-dlp, ffmpeg and OpenAI are gone.

Don't add a dependency without it being approved first. Ask instead.

## Commands

- `pnpm test`: Vitest, unit tests only.
- `pnpm test:integration`: the test that calls the real Claude API (needs a real `ANTHROPIC_API_KEY`). Never part of `pnpm test`.
- `pnpm lint`: ESLint check only. Never run it with `--fix`.
- `pnpm typecheck`: `tsc --noEmit`.
- `pnpm build`: `tsc --build tsconfig.build.json`.
- `pnpm dev`: `tsx watch --conditions=development --env-file=.env src/server.ts`.

If a script above doesn't exist yet, add it as part of the task that first needs it.

## Environment

Parsed once with Zod in `config.ts`; nothing else reads `process.env`. `.env.example` lists every variable with its default. What isn't obvious from there:

- Gemini (ADRs 0081–0083): `GEMINI_MODEL`, `GEMINI_API_KEY` and `YOUTUBE_API_KEY` are required (`config.geminiModel`, `geminiApiKey`, `youtubeApiKey`; the keys in `.env` only, or Secret Manager on the VM); the Gemini key is sent as `x-goog-api-key`, never in the URL, and never appears in an error or a log. `GEMINI_BASE_URL` and `YOUTUBE_API_BASE_URL` (optional) are test doubles that only the e2e stack sets; `clients/geminiOptions.ts` turns the settings into client options. `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `TRANSCRIPTION_MODEL`, `POT_PROVIDER_URL`, `WORK_DIR`, `GOOGLE_CLOUD_PROJECT`, `GEMINI_LOCATION`, `GEMINI_ACCESS_TOKEN`, `WHISPER_URL` and `WHISPER_MODEL` are removed: a leftover value is ignored and logged at `warn`. `DATA_DIR` is `/data` (a named volume) and `VAULTS_PATH` is `/vaults` (bind-mounted from `VAULTS_HOST_PATH`, ADR 0063) in Docker.
- `ANTHROPIC_API_KEY` is required; `VAULTS_PATH` (the folder that holds every user's vault) must exist and be writable at startup, or the server exits with a message. The key lives in `.env` only.
- `DEFAULT_NOTE_FOLDER` is validated at startup with the shared folder rules; it is created in a user's vault the first time a note is saved there, not at startup.
  It is only the fallback (ADR 0059): `Job.default_folder` for a job in review is its prompt profile's `last_folder` while that folder still exists in the vault (`defaultFolderFor`, checked read-only by `existingFolderSync`), and `saveJob` remembers the folder it wrote to for the profile once the write succeeds.
- Sign-in (ADR 0061) needs `ADMIN_EMAIL` (lower-cased; the first Google account to sign in must match it), `APP_ORIGINS` (comma-separated `scheme://host[:port]` with no path, normalised and de-duplicated; `config.appOrigins`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY` (32 bytes, base64; also signs the sign-in cookie), all required. `SESSION_DAYS` (1–365, default 30) and `VAULTS_PATH` (default `/vaults`, `config.vaultsPath`) are optional. Gmail (ADR 0035) is therefore always configured: `config.gmail` is built from the same three variables. `E2E_TEST_SIGNIN=1` (set only by the e2e Compose override; `config.e2eTestSignin`) mounts `POST /api/test/session`, which signs in any email and so makes the server refuse to start unless `NODE_ENV=test` (`assertTestSigninAllowed`); it is never in `.env.example`. `GOOGLE_REDIRECT_URI`, `VAULT_PATH` and `OBSIDIAN_VAULT_NAME` are removed: a leftover value is ignored and logged at `warn` (`ignoredEnv`). A user's vault is `VAULTS_PATH/<users.vault_dir>`: `vaultRootFor( userId )` in `vault.service.ts` returns it and throws `VaultNotChosenError` (409 "Choose your vault first") when the user has not chosen one, or `VaultMissingError` (409 "Your vault folder is missing", ADR 0070) when the folder is gone or is now a file or a symlink (one `lstat`; `vaultFolderMissing( vaultDir )` is the same check, and `getMe` reports it as `vault_missing`); every vault read and write goes through it. A user whose vault is missing may claim or create a vault again through the `/api/me/vault*` routes (`setVaultDir( id, dir, expected )` is a compare-and-set on the old value).
- The vault agent service (ADR 0042) is optional: `config.agent` is `null` unless `AGENT_SECRET` (at least 32 characters) is set, and then jobs skip linking. `AGENT_URL` defaults to `http://localhost:8100`, `AGENT_TIMEOUT_MS` to 120000.
- `LOG_LEVEL` (ADR 0049): `fatal`, `error`, `warn`, `info` (default), `debug`, `trace` or `silent`; vitest runs with `silent`.
- `STATUS_CHECK_INTERVAL_MINUTES` (ADR 0050, default 2): how often the service monitor checks the agent and the Gemini model in the background.
- `LITESTREAM_METRICS_URL` (optional URL, `config.litestreamMetricsUrl`; set only on the VM): `runServiceChecks` then also reads Litestream's Prometheus text (`litestreamMetrics.client.ts`, 2 s timeout) into the admin's `replication` row. It fails when the metrics can't be read or `litestream_sync_error_count` rose since the previous check (the first sample never fails; a counter that went down means a restart), and its detail is `{ last_sync_at }`, the time the check saw `litestream_sync_count` rise (Litestream exposes no last-sync metric); an old last sync alone is never a failure. `pruneHealth()` at start deletes health rows of checks that are not configured (replication, vault sync).
- The `transcription` health check is `checkGeminiModel` (a free `GET` of the model resource, ADR 0083). Schema 13 (migration `geminiTranscription`) dropped the `whisper`, `backup` and `pot_provider` health kinds, failed jobs that were `downloading` or `converting`, and added `input_tokens` and `output_tokens` to `transcription_runs`. Schema 14 (v0.11.0) dropped `transcription_runs.pieces` and renamed `audio_seconds` to `duration_seconds`; released migrations are locked by hash in `repositories/migrations.lock.json` (`pnpm migrations:lock` adds new ones) and upgrade-tested from the SQL seeds in `repositories/fixtures/` (ADR 0085).
- `VAULT_CREATE_ENABLED` (`true`/`false`/`1`/`0`, default true, `config.vaultCreateEnabled`; false on the VM, ADR 0075): `createVault` answers 403 `ForbiddenError` "New vaults are set up by the admin" without making a folder, and `GET /api/me/vaults` returns `can_create`; claiming an existing folder is unchanged.
- `VAULT_SYNC_STATUS_DIR` (optional, `config.vaultSyncStatusDir`; set only on the VM, ADR 0075): `runServiceChecks` then reads `<dir>/<vault_dir>.json` (`VaultSyncStatusFile` in shared) for every active user with a vault and records a `vault_sync` check for that user (subject ID = the vault folder). It fails when the file is missing or unreadable, when `state` is `failed` (the message is `last_error`), or when `heartbeat_at` is more than 5 minutes old. A member's Status panel shows their own row; the admin sees every active user's row named `Vault sync: <name>` (`listVaultSyncHealth` in `system.repository.ts`), and may read any of their error histories (`getHealthErrors` finds the owner by vault folder; a member's request for another folder is a 404).
- `BACKUP_DIR` and `BACKUP_HOST_PATH` are removed (ADR 0076): a leftover value is ignored and logged at `warn`. Pre-migration copies of the database go to `pre-migration/` beside it.
- Melete (ADRs 0056, 0060): `APP_TIME_ZONE` (an IANA name checked with `Intl.DateTimeFormat`, default `Asia/Singapore`) and `MELETE_DAY_START_HOUR` (0–23, default 4) set when Melete's day starts; `MELETE_REQUEST_RETENTION` (above 0.7, up to 0.99, default 0.9) is FSRS's target recall; `MELETE_GRADING_TIMEOUT_MS` (20000) and `MELETE_GENERATION_TIMEOUT_MS` (120000) bound the two Claude calls; the "Open in Obsidian" link uses the user's own vault folder name (`vaultDirFor( userId )`, ADR 0063), so there is no variable for it. They are `config.timeZone` and `config.melete`.
- `WEB_DIR`: empty in development (Vite serves the web app). When set, Express serves it, with an `index.html` fallback for paths without an extension.

## Folder structure

```
src/
  server.ts          boot only: load config → check the vaults folder → open the store → give every user the prompt profiles they lack (`seedAllUsers`) → recover interrupted jobs → start sweeper, worker, Melete generator, intake poller and service monitor → listen
  app.ts             builds the Express app and mounts routes and the error middleware; tests import this, not server.ts
  config.ts          env parsed with Zod
  shutdown.ts        signal handling: stop the sweeper, the worker, the Melete generator, the intake poller, the service monitor and the server, close the store, exit; with a timeout
  errors.ts          typed errors and the error middleware
  logger.ts          the pino logger (ADR 0049); logContext.ts holds the job, feed, Gmail source or Melete note ID for every line written inside `withLogContext`
  middleware/        requestLog.ts: one log line per request (method, route pattern, status, duration; health and status skipped); `auth.ts` (ADR 0061): `requireUser` (session cookie → 401 `unauthenticated`, sliding refresh, the user's ID in the log context), `requireAdmin` (a member gets 404), `parseCookies` and `currentUser( req )`, which reads the user from a `WeakMap` because Express's `Request` can't be extended without a namespace; `jsonOnly.ts` (POST, PUT, PATCH and DELETE must be `application/json`, else 415); `requestOrigin.ts` (`requestOrigin( req, origins )` and `requestScheme`: forwarded headers are believed only from a loopback or private-network peer (ADR 0071: Docker Desktop shows requests through the published port as coming from its gateway, 192.168.65.1), and the result is always one of `APP_ORIGINS`); `requireModule.ts` (`requireModule( module )`: a user without the module gets the 404 of an unknown route; `app.ts` mounts it on `/api/jobs`, `/api/feeds`, `/api/inbox`, `/api/gmail` and `/api/vault` for Transcriber and on `/api/melete` for Melete, never on the shared `/api` mount)
  jobs/              lifecycle.ts (ADR 0048): the pure table of job statuses, their properties and allowed moves, `canMove`, `assertMove`, `statusesWhere` and the link-state moves; no imports from services or repositories
  routes/            <name>.routes.ts: an Express Router wiring paths to controller functions, nothing else. `app.ts` mounts them in this order: `requestLog`, `express.json`, `jsonOnly`, health, auth (the only routes open to a signed-out person), `requireUser`, `/api/me`, then every other router (ADR 0061)
  controllers/       <name>.controller.ts: HTTP only (parse the request with Zod, call a service, send the response)
  services/          <name>.service.ts: business rules and job state changes (auth: `beginSignIn` / `completeSignIn` (the signed `atlas_oauth` cookie holding `state`, the PKCE verifier, `returnTo` and the origin; HKDF-derived HMAC key; the first-admin rule) and `getMe`; session: `createSession`, `resolveSession` with the sliding expiry, `cookieOptions`, `sweepSessions`; modules: `modulesFor( userId )`, the admin's every module or the member's switched-on ones; seedUser: a new user's own prompt profiles and default, in one transaction (ADR 0065); jobs, vault, settings (a request that changes a setting of a module the user lacks is refused whole, a 404), prompts (profiles are filtered by `purpose`: summary and linker need Transcriber, the five Melete prompts need Melete), models, feeds, inbox, gmail, gmailSources: the sources, their sync and checks, and health: `recordCheck( userId | null, subject, result )` is the one way a check reports (null for the app's own services), and `runServiceChecks` checks the agent and the transcription model (`GET /v1/models/<model>`, free) for the app; admin (ADR 0067): `listAdminUsers`, `createUser` (user, modules and `seedUser` in one transaction), `changeUser` (name, modules, status; removing deletes the user's sessions in the same transaction), `resetVault`, `getUsage` (the usage report for a calendar month in `APP_TIME_ZONE` and for all time, every user listed) and `deleteUserAccount` (removed users only, the email typed as confirmation; the cascade does the rest), all refusing the admin as target with a 409, mounted at `/api/admin` behind `requireAdmin`; status: builds the Status panel's rows and states from the caller's health rows and live feeds, sources and Gmail account, plus the app's services for the admin only (a member's refresh runs no app check, and the error history of an app service is a 404 to a member); melete: enrolment and the Today, subject and note reads, with `meleteScan`, which scans a user's learning root on demand and one at a time for each user (ADR 0057), and `meleteNoteMapping` (`setNoteConceptsByHand`: a hand mapping pins the note, clears its flag and queues a labels-only Map; `applyOffSyllabusAction`: dismiss, or add the suggested concept and map the note to it), and `meleteMapping` (`mapForNote`, ADR 0089: the Map call for a queued note, labels only for a hand-mapped one, a failure stored on the note), and `meleteGeneration`, which makes one note's questions with a single Claude call and stores a failure on the note instead of throwing (ADRs 0055, 0058), and `meleteSyllabus` (v1.1, ADR 0089: `requestSyllabusDraft` sets a subject `drafting` and the loop runs `draftForSubject`, which makes one Claude call and stores the sections and concepts, or the failure on the subject), and `meleteReview`, which picks the next question (due, then new within the day's limit, then learning-soon), grades an answer with one Claude call that answers `failed` instead of throwing, and records a rating: the card, the review row and the review mode in one transaction)
  repositories/      <name>.repository.ts: the SQLite database and nothing else; database.ts holds the connection, the baseline schema (migrations 1–9 collapsed into it at schema 10, ADR 0066) and nothing seeded (that is `services/seedUser.service.ts`, ADR 0065); users, userModules, sessions and appSettings (ADR 0061, no `userId` argument for the first, third and fourth); promptProfiles, settings, jobStore, summaryRuns, linkRuns and linkSuggestions (per user from 4.1–4.2: `userId` is the first parameter of every function; `jobRows.ts` is their shared row mapping, not a repository) and `system.repository.ts` (ADR 0062: the only queries without a user, for the loops that serve everyone, each row saying whose it is: `claimNextJob( now )` and `claimNextGeneration( now )` (ADR 0064: only for users in the `eligible_users` view, which means active with the module on, the admin always, and for Melete a chosen vault; the user whose `last_job_started_at` / `last_generation_started_at` is oldest goes next, never-started users first, then the one who joined first; a claim stamps the user in the same transaction, and `claimNextJob` does not move the job, because the source adapter makes the first move), `listDueFeeds` and `listDueGmailSources` (eligible Transcriber users only), `listExpiredJobs` (everyone, no eligibility), `usageTotals` and `transcriptionSeconds` (ADRs 0067, 0069: counts and sums over the `usage_events` view and the `jobs.duration_seconds` each video job keeps, for the admin's usage report), `markInterruptedJobs`, `markInterruptedLinkingJobs` and `requeueGenerating` and `requeueMapping` (the restart recovery, everyone), and `claimNextMapping` (a note queued for Map whose questions are not waiting, same turns as generation)); feeds, feedItems, health (ADRs 0050, 0065: `health_status` and `health_errors`, one row per feed, Gmail source, Gmail connection (its subject ID is the user's ID), agent, transcription and replication; the first three belong to a user, the last three to the app with a NULL `user_id`, and a CHECK keeps the two apart, so its functions take `userId: string | null` first and `listHealth( userId, includeApp )` positionally; the feed and source repositories read their last check and error from it by a join), and for Gmail (ADRs 0035, 0037): gmailAccount, gmailSources, gmailMessages, postings, extractionRuns, and for linking (ADRs 0045, 0046): linkRuns and linkSuggestions (promptProfiles also holds the hidden linker profile and the two Melete profiles, told apart by `purpose`, and each profile's `last_folder`, ADR 0059), and for Melete (ADR 0058; the `melete_*` tables): meleteSubjects, meleteNotes, meleteQuestions (the FSRS card columns, `saveCard`, and the review queries, which all join the note and filter to enrolled, live notes and active questions), meleteReviews, meleteRuns (all per user from 4.5; v1.1 adds meleteSections, meleteConcepts (with `replaceSyllabus`, the all-or-nothing redraft) and meleteNoteConcepts (`setNoteConcepts` replaces a note's whole mapping), `setQuestionConcept` relabels a question without touching its card, and a run row can name a `subject_id` and the kinds `syllabus`, `map` and `suggest`, ADR 0089; the generation queue's `claimNextGeneration` and `requeueGenerating` are in `system.repository.ts`, each note saying whose it is)
  gmail/             Gmail intake (ADR 0035): tokenCipher (AES-256-GCM for the refresh token), auth (OAuth consent, the cached Gmail client, `withGmail` and the reconnect rule), gmail.client (labels, message ids by label or search, messages; the only module that calls the Gmail API, always through `withGmail`) parseMessage (a Gmail message to subject, sender, date and bodies; pure), links (the Gmail web link to a message) and stripFixture (removes what could identify a mailbox from a saved fixture)
  clients/           <name>.client.ts: one external service each (gemini (`transcribeYouTube`, `checkGeminiModel`; `geminiOptions.ts` builds its options), youtubeData (`getVideoMeta`: title, channel, length, privacy), claude, anthropicModels, vault, http, and the vault agent service, ADR 0042: `agent.client.ts` with `requestLinks`, `fetchInstructions`, a cached `checkHealth` and `AgentError`); the vault client resolves every folder inside the vault (`resolveFolder`, which creates: only the job save and the learning-root setting use it, ADR 0072) and holds `isSkippable` (the error codes `EACCES`, `EPERM`, `ENOENT`, `ENOTDIR` and `ELOOP` that a walk skips) and `listFolderTree( …, onSkip )`, which keeps an unreadable folder in the picker with no children
  sources/           adapters that turn a job into a `SourceDocument` (ADR 0030): video and article adapters, article extraction (ADR 0031), feed parsing and discovery (ADR 0032), pasted text, `emailToMarkdown` (a newsletter email to Markdown, ADR 0040), `adapterFor( sourceType )`; they use clients and report steps through the context, never touch repositories
  worker/            worker, runJob, summarizeJob, linkJob, meleteGenerator, sweeper, intakePoller, serviceMonitor: runs the next runnable job; `meleteGenerator` (ADR 0058) makes questions for the queued Melete notes of every user, one at a time and for each note's owner, beside it, putting notes left `generating` by a restart back in the queue on start, drafting the syllabus of every subject that is `drafting` first and, last, mapping the notes queued for it (`claimNextMapping`; notes left `mapping` by a restart go back to `queued`) (`claimNextDraft`, which takes the same turns between users and needs no restart recovery, because `drafting` is the queue); deletes expired jobs; every minute, one pass at a time, checks due feeds and then due Gmail sources (each on its own, so one failing doesn't stop the other); every `STATUS_CHECK_INTERVAL_MINUTES`, checks the agent and the transcription model
  summarizer/        pure constants and functions: locked prompts, seeded profiles, prices
  melete/            Melete (ADR 0054): pure helpers and constants for the learning module: `prompts.ts` has the locked instructions, default guidance and `buildMeleteSystemPrompt`; `scan.ts` has the scan helpers (front-matter split, title, body hash, the vault walk: `walkSubject` returns `{ files, skipped }`, skipping a subdirectory or note it can't read, while the subject's own folder still throws), `scanClock.ts` the 30-second rule (ADR 0057), kept per user, `scanOutcome.ts` the paths the last scan skipped for each user (in memory, returned as `skipped_paths` on `GET /api/melete/today`; a scan that runs replaces it, a fresh one leaves it) and `questions.ts` the post-processing of the model's questions (`processApprovedQuestions` for an approved syllabus, ADR 0089) with `conceptRefs.ts`, the c1…cN refs Claude sees in place of concept ids, and `map.ts`, the Map call's user message and its answer made storable; `scheduler.ts` wraps `ts-fsrs` (ADR 0056: FSRS, fuzz on, the card to and from the question's columns, a no-fuzz scheduler for tests), `day.ts` finds when Melete's day started in `APP_TIME_ZONE`, `queue.ts` counts what is due, new and coming up (the day's new-question allowance and the 20-minute learn-ahead), `grading.ts` spots a blank answer, `obsidian.ts` builds the "Open in Obsidian" link, `runs.ts` writes the run row for every Claude attempt and `syllabus.ts` makes a drafted syllabus storable (trimmed, unique, at most 80 concepts) and builds the draft's user message. Melete reads the vault and never writes to it; it imports only shared clients (vault path checks, Claude, pricing, prompts) and its own `melete_*` tables, and the ingest code never imports it
  formatters/        markdown, srt, txt, summary, note: pure data → string; summary.cleanup.ts filters the model's output
```

## Layers

The order is routes → controllers → services → repositories, and every request goes through all four.

- **Routes** map a method and path to a controller function. They hold no logic, validation or try/catch.
- **Controllers** read `params`, `query` and `body`, validate them with a Zod schema, call one service function, and send the response with an explicit status code. They never touch the job store, a client or the worker.
- **Services** hold the business rules, change job state, call repositories and formatters, and throw typed errors. Every status change goes through `moveTo()` in `jobs.service.ts`, which refuses any move `jobs/lifecycle.ts` doesn't list and sets or clears `expires_at` from the target state; callers don't pass `expires_at` except the autosave reset. A function that makes one move also names the one status it starts from (`assertFrom`), because the same target can be reached from several.
- **Repositories** hold and query the SQLite database (better-sqlite3, ADR 0012) behind synchronous free functions, and nothing else. `database.ts` owns the connection and the migrations (`openDatabase` / `closeDatabase` from `server.ts` and `shutdown.ts`, `getDatabase` from the other repositories); tests open `':memory:'` through `test-support/database.setup.ts`, which seeds nothing: a test that needs profiles makes a user with `createTestUser` (it runs `seedUser`).
- **Clients** wrap one external tool each: run the command or make the HTTP call, parse the output with Zod, return typed data, and throw on failure. They hold no job logic.
- **The sweeper** calls one service function on a timer and deletes expired jobs; it never touches repositories.
- **The worker** calls services and clients, never repositories. It takes the next runnable job in turns between eligible users (`claimNextJob` returns the job and its owner; a user whose Transcriber module is off or who was removed keeps their queued jobs, untouched, until access returns) and runs it for that owner, with `job_id` and `user_id` in the log context. It processes one job at a time and moves it through `queued → transcribing → summarizing → linking → ready_for_review | summary_failed` for a video, `queued → fetching → summarizing → …` for an article (or `failed`) via services. `linking` happens when `config.agent` is set and linking is switched on, and sends the owner's `vault_dir` (an owner with no vault gets the link error "Choose a vault first" and no agent call); a linking failure is never fatal: the job reaches review with `link_state = 'failed'` and its reason (ADRs 0044, 0045). A job found already `summarizing` runs only the summarize step. Regenerating a summary is the one other way into `summarizing`: `ready_for_review → summarizing` (ADR 0029). Each summary attempt records a row in `summary_runs`, through the jobs service.
- **Formatters** are pure functions with no I/O. Only services call them.
- Nothing imports `routes/` or `controllers/` except `app.ts`.
- The worker deletes a job's audio files when the job finishes, whether it succeeded or failed.
- The one exception is `web.routes.ts`, which serves the built web app from `WEB_DIR` with no controller. `GET /api/health` (unauthenticated, localhost only) answers `HealthResponse` from `healthReport.service.ts`: `ok`, the `version`, the stored `schema` and the `replication` state, which `deploy.sh` reads (ADR 0086). `src/scripts/preMigration.ts` is run by `deploy.sh` in the app image to find and swap the pre-migration copy; it reads `DATA_DIR` and imports no config.

## Logging

- Log through `logger` from `logger.ts` (pino, JSON per line; `pino-pretty` only in `pnpm dev`), never `console` (`no-console` is an ESLint error in `src/`; `config.ts` is the one exception because it runs before the logger exists).
- A fixed message and the variable parts as fields: `logger.error( { err: error, feed_id }, 'Feed check failed' )`. Pass errors as `err`.
- `logContext.ts` holds `job_id`, `feed_id`, `gmail_source_id` or `melete_note_id` in an `AsyncLocalStorage`; wrap each unit of work in `withLogContext( { … }, fn )` and every line written inside carries it. `requestLinks` sends the job ID to the agent as `X-Job-Id`.
- Never log bodies, note or transcript text, prompts, email content, tokens or keys. `redact` covers fields named like secrets one level down; don't rely on it for anything else.
- Tests spy on the logger (`vi.spyOn( logger, 'error' )`); a test that mocks `config.js` must include `logLevel`.

## Errors

- Services throw typed errors from `errors.ts`:
  - `ValidationError` → 400
  - `ForbiddenError` → 403, e.g. creating a vault where the admin has switched that off
  - `NotFoundError` → 404
  - `BadGatewayError` → 502, a site that can't be read while previewing or adding a feed
  - `MeleteError`: not an HTTP error; a Melete Claude call that gave nothing usable, with the billed tokens when there were any. Services store it as a note's failure or a `failed` grading response
  - `UnauthenticatedError` → 401 `{ error: 'unauthenticated' }`, the text the web app looks for; `UnsupportedMediaTypeError` → 415; `UnknownOriginError` → 400 "This address isn't configured in APP_ORIGINS"
  - `ConflictError` → 409, e.g. downloading a transcript before the job is `ready_for_review` or `summary_failed`
- One error middleware in `errors.ts` maps those errors to status codes, and maps a `ZodError` from a controller's parse to 400.
- Anything else is logged with the error and returns 500 `{ error: 'Internal Server Error' }`.
- Express 5 forwards rejected promises to that middleware, so controllers don't wrap their bodies in try/catch.
- A failing client marks the job `failed` with a readable `error` message; it never crashes the worker.
- Catch an error only where you handle it differently, and never swallow one silently.

## TypeScript style

**Spacing**
- Put a space inside every non-empty `( )`, `[ ]`, `{ }` and `< >`, for example `Promise< void >`. Empty brackets stay tight.
- No space between a keyword and its parenthesis: `if( … )`, `for( … )`, `catch( error )`.
- No semicolons.
- Leave one blank line between top-level definitions, and a blank line between the reading, the work and the response inside a function.
- There is no formatter. ESLint enforces style as a check only.

**Line length and breaking**
- Lines stay within 100 characters.
- When a function call or a function signature would pass 100 characters, put each argument or parameter on its own line, with a trailing comma.
- Break an import across lines when it names more than three things, one name per line, with a trailing comma.

**Quotes**
- Single quotes in TypeScript.
- Double quotes in HTML and JSON.
- Template literals instead of concatenation.

**Types**
- Every exported function has explicit parameter and return types. No `any`; use `unknown` and narrow it.
- Use erasable syntax only: no `enum`, no `namespace`, no parameter properties. For a fixed set of values, use a string-literal union or an `as const` object.
- Structured values are Zod schemas with `z.infer` types. Request input and external tool output are parsed with Zod, never cast with `as`.
- Request bodies, response shapes, `Job`, `JobStatus`, `DownloadFormat` live in `@atlas/shared`, because the web app imports them too. Controllers import them and never define them locally. Only schemas no other package uses, such as a route param or a client's raw output, may be local.
- Annotate the exported app as `Express` and every exported router as `Router`. Without it, declaration emit fails under pnpm (TS2883).

**Naming**
- Meaningful names; no abbreviations beyond `id` and `url`.
- Files and folders are camelCase with a role suffix: `jobs.routes.ts`, `jobs.controller.ts`, `jobs.service.ts`, `jobStore.repository.ts`, `gemini.client.ts`, `markdown.formatter.ts`.
- Functions and variables are camelCase; types and schemas are PascalCase.
- Fields that mirror a wire contract keep the contract's casing, so there's no mapping layer.

**Imports**
- Group imports under a one-line comment naming the group, in this order:
  1. `// Packages`, with the package name instead when one group is a single package (e.g. `// Express`)
  2. `// Shared`
  3. `// Services`, `// Repositories`, `// Clients` and so on, by layer
- Relative and aliased imports use the `.js` extension, as `tsc` emits them; TypeScript and tsx resolve it to the `.ts` source.
- Use the `#src/*` alias whenever a relative import would climb two or more levels (`../../`). Relative imports are fine within a folder or one level up. The alias is a Node subpath import in `package.json`: the `development` condition points at `./src/*` (set by `tsx --conditions=development` and `customConditions` in `tsconfig.json`), and `default` points at `./dist/src/*`. Don't add `paths` aliases to `tsconfig.json`: Node doesn't read them at runtime.
- `@atlas/shared` is imported by its package name, never by a relative path.

**Code shape**
- Destructure what a handler uses from the request in its parameter list: `( { params, body }: Request, res: Response )`.
- Functions are arrow functions assigned to a `const`, exported or not. A `function` declaration is allowed only when it must be hoisted, with an `eslint-disable-next-line func-style` comment saying why. A function used once whose body is a single expression is written inline. ESLint enforces this with `func-style`.
- No unnecessary abstractions; do things inline when they can be done inline.
- No comments or JSDoc that restate the code. Comment only on why. Import-group comments are the exception.

**Reference example** (`feeds.routes.ts` and part of `feeds.controller.ts`)

```ts
// Express
import { Router } from 'express'
// Controllers
import { addFeed, getFeeds } from '../controllers/feeds.controller.js'

export const feedsRoutes: Router = Router()

feedsRoutes.get( '/feeds', getFeeds )
feedsRoutes.post( '/feeds', addFeed )
```

```ts
// Express
import { Request, Response } from 'express'
// Shared
import { CreateFeedBody, FeedResponse, ListFeedsResponse } from '@atlas/shared'
// Services
import { createFeed, listFeeds } from '../services/feeds.service.js'

export const getFeeds = ( _req: Request, res: Response< ListFeedsResponse > ): void => {
  res.status( 200 ).json( { feeds: listFeeds() } )
}

export const addFeed = async (
  { body }: Request,
  res: Response< FeedResponse >,
): Promise< void > => {
  const feed = await createFeed( CreateFeedBody.parse( body ) )

  res.status( 201 ).json( { feed } )
}
```

## Test-first workflow

The root `CLAUDE.md` makes TDD the rule. This is how it runs here:

1. **Write the task's tests first.** The approved checkpoint plan lists them. Start with the outermost behaviour it names:
   - an endpoint is tested through `app.ts`;
   - a rule or state change is tested at the service;
   - a client is tested against mocked tool output;
   - a formatter is tested with a fixed transcript in, exact string out.
2. **Run them and watch them fail for the right reason:** a failed assertion, not an import or syntax error. Then write the least code that makes them pass, working down the layers.
3. **Refactor only while the tests are green.** Don't add behaviour no test asks for. If you find you need some, add a test for it first.
4. **A bug fix starts with a test that reproduces the bug.**
5. **Never change or delete an existing test to make code pass.** If you think a test is wrong, stop and say so.

## Tests

- Tests sit next to their source with the same name plus `.test.ts`, e.g. `jobs.service.test.ts`.
- Routes and controllers are tested through `app.ts` with Supertest, including the status code for each typed error. Route tests that sit behind `requireUser` import `signedInRequest as request` from `test-support/auth.ts`: it acts as a default admin (made on first use, as each test has a new database) and sends `application/json`; `createTestUser( { role, modules, vault_dir } )` and `signedIn( agent, user )` give a test another user. The default admin's vault is `DEFAULT_TEST_VAULT` under `config.vaultsPath` (`defaultTestVaultPath()`), and `defaultTestAdmin()` makes the folder, because a vault must exist to be used; vitest gives each worker its own `VAULTS_PATH` (`test-support/vaults.setup.ts`), so a test file that empties it can't break another worker; a user made without `vault_dir` has none, and a test that mocks `config` sets `vaultsPath`. The fake Google client is `test-support/googleSignIn.fake.ts`. Never start a real server in a test.
- External tools are mocked with Vitest (`vi.mock`): service and worker tests mock the client modules; client tests mock `node:child_process` or `fetch` and assert on the command or request they build and how they parse the output.
- Unit tests never call Gemini, the YouTube Data API or Claude, and never touch the network.
- Integration tests that use the real tools are named `*.integration.test.ts` and run only through `pnpm test:integration`.
- Reset the job store between tests so no test depends on another's jobs.
- Use Vitest fake timers for anything time-based. Never use real sleeps.
