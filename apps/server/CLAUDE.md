# apps/server

Express 5 API for Atlas: the SQLite store, the background loops (worker, sweeper, Melete generator, intake poller, service monitor), the clients for Gemini, the YouTube Data API, Claude and the vault, and the pure formatters. The root `CLAUDE.md` covers workflow, git and cross-app rules. `docs/architecture.md` describes how the parts fit; the code is the truth for what each part does today.

## Stack and commands

Node 24, ESM, TypeScript `strict`, Express 5, Zod, better-sqlite3, pino, `@anthropic-ai/sdk`, `ts-fsrs`. Vitest + Supertest.

- `pnpm test` unit tests · `pnpm test:integration` calls the real Claude API, never part of `pnpm test`
- `pnpm lint` ESLint, check only (never `--fix`) · `pnpm typecheck` · `pnpm build` → `dist/`
- `pnpm dev` runs the source with `tsx --conditions=development`
- `pnpm migrations:lock` after adding a migration (see root `CLAUDE.md`)

## Environment

Parsed once with Zod in `config.ts`; nothing else reads `process.env`. `apps/server/.env.example` lists every variable, its default and what it does (the root `.env.example` is the Compose subset); `envExample.test.ts` keeps the file and `config.ts` in agreement. Read the file instead of a copy here. Removed variables are listed in `config.ts` (`ignoredEnv`) and logged at `warn` if still set. Keys and secrets live in `.env` (Secret Manager on the VM), are sent in headers never URLs, and never appear in a log or error.

## Layout

```
src/
  server.ts       boot only; app.ts builds the Express app (tests import app.ts)
  config.ts  errors.ts  logger.ts  logContext.ts  shutdown.ts
  middleware/     requestLog, auth (requireUser, requireAdmin, currentUser), jsonOnly, requestOrigin, requireModule
  routes/         <name>.routes.ts — method + path → controller, nothing else
  controllers/    <name>.controller.ts — parse with Zod, call one service, send with an explicit status
  services/       <name>.service.ts — business rules, state changes, typed errors
  repositories/   <name>.repository.ts — SQLite only; database.ts owns the connection and runs the migrations, whose SQL is in sql/*.sql;
                  system.repository.ts holds the only cross-user queries (the loops' claims)
  clients/        one external service each; parse output with Zod, throw on failure, no job logic
  sources/        adapters that turn a job into a SourceDocument; use clients, report through the context
  worker/         the loops; call services and clients, never repositories
  jobs/lifecycle.ts   the one table of job statuses and allowed moves; imports nothing from services
  summarizer/ melete/ themis/ time/ formatters/   pure functions and constants, no I/O
  gmail/          OAuth, token cipher, the Gmail client (the only module that calls the Gmail API)
  test-support/   in-memory database setup, signed-in Supertest agent, fakes
```

## Layers

routes → controllers → services → repositories; every request goes through all four.

- Routes hold no logic, validation or try/catch. Controllers never touch a repository, client or loop. Services throw typed errors from `errors.ts`; the one error middleware maps them (400 Validation/UnknownOrigin/Zod, 401 Unauthenticated, 403 Forbidden, 404 NotFound, 409 Conflict, 415, 422, 502 BadGateway, else logged 500). Express 5 forwards rejected promises, so no try/catch in controllers.
- Every job status change goes through `moveTo()` in `jobs.service.ts`, which refuses any move `lifecycle.ts` doesn't list; a function making one move names its starting status with `assertFrom`.
- Repositories take `userId` as the first parameter. Only `system.repository.ts` queries across users (for the loops), and every row it returns says whose it is.
- The vault is read through `vaultRootFor( userId )` in `vault.service.ts`, and written only by the job save. Paths are resolved with `realpath` and checked to be inside the vault (`vault.client.ts`); never build a vault path any other way.
- Nothing imports `routes/` or `controllers/` except `app.ts`. Formatters are pure and called only by services. A failing client marks the job `failed` with a readable message; it never crashes a loop.
- Catch an error only where you handle it differently. Never swallow one silently.

## Logging

`logger` from `logger.ts` (pino), never `console` (ESLint error; `config.ts` is the exception). Fixed message, variable parts as fields, errors as `err`: `logger.error( { err, feed_id }, 'Feed check failed' )`. Wrap each unit of work in `withLogContext( { job_id | feed_id | … }, fn )`. Never log bodies, note or transcript text, prompts, email content, tokens or keys.

## TypeScript style

ESLint enforces it as a check; there is no formatter.

- Space inside every non-empty `( )`, `[ ]`, `{ }`, `< >`: `Promise< void >`, `fn( a, b )`. Empty brackets tight. No space before a keyword's parenthesis: `if( … )`, `catch( error )`.
- No semicolons. Single quotes (double in HTML/JSON). Template literals, not concatenation. Lines ≤ 100 chars; when a call or signature overflows, one argument per line with a trailing comma; an import naming more than three things is broken one per line.
- One blank line between top-level definitions, and between the reading, the work and the response inside a function.
- Explicit parameter and return types on every export. No `any`; narrow `unknown`. Erasable syntax only: no `enum`, `namespace` or parameter properties. Structured values are Zod schemas with `z.infer`; input and external output are parsed, never cast with `as`.
- Shapes both apps use live in `@atlas/shared`; only a route param or a client's raw output may be local. Exported app is annotated `Express`, routers `Router` (TS2883 under pnpm otherwise).
- Files camelCase with a role suffix (`jobs.service.ts`). Functions and variables camelCase, types and schemas PascalCase. No abbreviations beyond `id` and `url`. Wire fields keep the contract's snake_case.
- Imports grouped under one-line comments (`// Packages`, `// Shared`, then by layer). Relative imports carry `.js`. Use `#src/*` when a relative import would climb two levels; `@atlas/shared` by package name only.
- Arrow functions assigned to `const`; a `function` declaration only when hoisting is needed, with an `eslint-disable-next-line func-style` reason. Destructure what a handler uses: `( { params, body }: Request, res: Response )`. No abstraction for one use; inline what can be inline. Comment only on why.

## Tests

- Test-first (root `CLAUDE.md`). Tests sit beside their source as `.test.ts`. Never change or delete an existing test to make code pass; if one looks wrong, stop and say so. A bug fix starts with a test that reproduces it.
- Endpoints are tested through `app.ts` with Supertest, including the status of each typed error; routes behind `requireUser` import `signedInRequest as request` from `test-support/auth.ts` (a default admin; `createTestUser` and `signedIn` for another user). Rules at the service; clients against mocked `fetch`; formatters with a fixed input and exact string out.
- External tools are mocked with `vi.mock`. Unit tests never touch the network or a real server. `*.integration.test.ts` runs only via `pnpm test:integration`.
- Each test gets a fresh `:memory:` database and its own `VAULTS_PATH` (`test-support/`). Fake timers for anything time-based; never real sleeps. A test that mocks `config.js` must include `logLevel` and `vaultsPath`.
