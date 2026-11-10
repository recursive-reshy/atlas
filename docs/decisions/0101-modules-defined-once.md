# 0101. A module is defined once, in `ModuleId`

- Status: Accepted
- Date: 2026-11-10

## Context
`ModuleId` in `@atlas/shared` already validates module names in the API, but the schema names them too: `user_modules.module` has a `CHECK` listing the three modules, and the `eligible_users` view lists `transcriber` and `melete`. Adding a module therefore needs a migration, and `app.ts` needs another `requireModule` line.

## Decision
- `ModuleId` in `@atlas/shared` is the registry and the only place a module is named. Application code validates with it; `listModules` ignores a stored name it does not know instead of failing, since SQL no longer rejects one.
- Migration 17 (`sql/17-modules-registry.sql`) rebuilds `user_modules` without the `CHECK` (same primary key, same cascade, no rows changed) and rebuilds `eligible_users` for members only: every active user with a `user_modules` row, no module named.
- The admin has every module the application knows and no stored rows. That rule moves into `eligible()` in `system.repository.ts`, which adds the admin's rows from `ModuleId.options`. TRD 6.1 says the list is passed as a parameter; the loops' queries bind their parameters by position in a fixed order, so the list is a SQL literal built from `ModuleId.options` instead. It is a code constant, never user input, and the module name is already inlined into these queries.
- `app.ts` mounts `requireModule` from `MODULE_ROUTES: Record< ModuleId, string[] >`, so a new `ModuleId` without routes does not compile.
- Adding a module is one entry in `ModuleId` plus its routes, with no migration. A new user needs no change in the app; the Obsidian sync block in `compose.prod.yml` stays a manual step (`docs/deploy.md`).

## Consequences
- Follows TRD §6; it does not change the TRD. The literal-for-parameter point above is the one difference in how.
- The 1.0 promise holds: migrations 10–16 are untouched, and 17 is locked with a seed (`fixtures/schema-17.sql`).
- The `CHECK` is gone, so a typo in a direct database edit is no longer refused; the API and `setModules` are the validators.

## Alternatives considered
- **Keep the `CHECK` and the view's list and add a migration per module:** what this replaces.
- **A `modules` table:** a second place that names modules, kept in step by hand.
