# 0098. The web source is grouped by feature

- Status: Accepted
- Date: 2026-11-10

## Context
`apps/web/src` is grouped by kind: `api/`, `hooks/` and `components/` each hold files from every module. Finding what one screen uses means three folders, and 129 component folders sit side by side.

## Decision
- `src/` source root holds `main.tsx`, `App.tsx`, `routes.tsx`, `theme.ts` and `queryClient.ts`, with their tests beside them.
- `src/app/`: the shell, drawer, gate, sign-in, `RequireModule`, `ConfirmDialog`, `NumberSettingField`, `moduleHome`, `moduleLabels`, and the hooks and api of the signed-in user (`useMe`, `useSignIn`, `useSignOut`, `useNavDrawer`, `me.api`, `auth.api`). Laid out flat: a component keeps its `<Name>/` folder with `index.ts`.
- `src/lib/`: `request`, `apiError`, `queryKeys`, `useDebouncedValue` and the formatters. No feature imports.
- `src/features/<feature>/` for jobs, feeds, inbox, gmail, vault, settings, status, admin, melete, themis, each with `components/<Name>/`, `hooks/`, `api/`, `fixtures/`. A file lives in the feature that owns its data. No barrel file at feature level; imports within a feature are relative, across features go straight to the owner's path.
- `src/test-support/`: render helpers, setup, and test data used by several features (`me.fixture`, `hookStates`, `noteFixtures`). `src/test/`: the tests of `public/` assets and `browserSetup.browser.test.tsx`.
- `#src/*` stays the alias for imports that climb two levels.
- Mirror tests (a hook test that only asserts the mocked api call or `invalidateQueries`, an api test that only checks a URL and a schema parse) are deleted; tests with their own branching, state, timing or error handling stay.

## Consequences
- Follows TRD §4; it does not change the TRD. Two wording points settled with Naresh: the root's "five files" means five source files and their tests; cross-feature test data stays in `test-support/`.
- Import paths change throughout; no behaviour, request or rendered output does.
- Moving files keeps their git history (`git mv`).

## Alternatives considered
- **Keep the kind-based folders:** every change to one module touches three folders.
- **One package per module:** a build and dependency change for a two-user app.
