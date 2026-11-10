# 0099. The schema SQL lives in files

- Status: Accepted
- Date: 2026-11-10

## Context
`repositories/database.ts` holds the baseline and every migration as template strings, 400 lines of SQL between the code that runs it. The migration lock (ADR 0085) hashes each migration's SQL string, so any move must leave every string byte-for-byte as it is.

## Decision
- The baseline is `repositories/sql/baseline.sql` and each later migration is `repositories/sql/<version>-<name>.sql` (`11-transcription-runs.sql`, …). A new migration is a new file plus one entry in the list in `database.ts`.
- `database.ts` reads the files once at module load with `readFileSync` and keeps `migrations` as the list of SQL strings, so `migrationLock.ts`, `lockMigrations.ts`, `release.sh` and `database.upgrade.test.ts` do not change. The file names are exported as `migrationFiles`, so a test can check that every file is listed and every listed file exists. (TRD 5.4 sketches `{ name, sql }` objects; a bare string keeps the lock tooling untouched, which is the point of the section.)
- The file bytes equal the old template strings exactly, so every hash in `migrations.lock.json` still verifies. A migration written as a function (the `Migration` type allows one) stays in code.
- `tsc` does not copy `.sql`, so `pnpm build` copies `src/repositories/sql` into `dist/src/repositories/sql` after compiling (`cp -R`, no dependency). The Docker build runs `pnpm build`, so the image gets the files.

## Consequences
- Follows TRD §5.4; it does not change the TRD. The build-script step is the one addition.
- A locked migration is still never edited: the lock test fails if a file's bytes change.
- A missing `.sql` in `dist/` fails at startup, loudly, not silently.

## Alternatives considered
- **Import SQL as a module (`?raw`, a bundler):** a bundler for the server.
- **Keep the strings in `database.ts`:** the file stays long and mixes SQL with the runner.
