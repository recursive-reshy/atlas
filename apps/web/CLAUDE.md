# apps/web

React UI for Atlas. Screens only: every rule and all data live in the server. The root `CLAUDE.md` covers workflow, git and cross-app rules; the server's TypeScript style (`apps/server/CLAUDE.md`) applies here unless this file says otherwise.

## Stack and commands

Vite, React 19, TypeScript `strict`, TanStack Query, React Router (data router), Material UI (the only UI library, themed from `src/theme.ts`), `@mdxeditor/editor` for the note editor. Vitest + Testing Library in jsdom; Vitest browser mode (Chromium and WebKit) for real-DOM behaviour.

- `pnpm dev` Vite on 5173, proxies `/api` to the server on 3100
- `pnpm test` jsdom project · `pnpm test:browser` `*.browser.test.tsx` (`pnpm exec playwright install chromium webkit` once)
- `pnpm lint` check only, never `--fix` · `pnpm typecheck` `tsc -b` · `pnpm build`
- The gate for a web task is all four: test, test:browser, lint, typecheck.

## Layout

```
src/
  main.tsx  App.tsx  routes.tsx  theme.ts  queryClient.ts     app wiring, each with its test beside it
  app/            shell, drawer, gate, sign-in, RequireModule, ConfirmDialog, moduleHome; useMe, useSignIn, useSignOut and their api
  lib/            request, apiError, queryKeys, useDebouncedValue and the formatters; imports no feature
  features/<f>/   home, jobs, feeds, inbox, gmail, vault, settings, status, admin, melete, themis; each holds
                  components/<Name>/ (<Name>.tsx, <Name>.test.tsx, index.ts), hooks/, api/, fixtures/
  test-support/   render helpers, setup, and test data several features share (me, hook states, notes)
  test/           tests of public/ assets and the browser setup
public/           manifest.webmanifest and icons, checked by tests in src/test/
```

A file lives in the feature that owns its data; a second feature imports it by its path (`#src/features/<f>/…`), and there is no feature-level barrel. Read `routes.tsx` for the pages and `features/` for what exists. Don't duplicate either here.

## Layers

- **Components** render props and call handlers: no `fetch`, no timers, no URL handling. They may import URL builders from a feature's `api/` (e.g. `downloadUrl`), never fetching functions.
- **Hooks** hold state and effects and call their feature's `api/`. Review drafts live on the server (`useAutosaveDraft`). Browser storage is only a per-viewer convenience, reached from hooks, inside try/catch, and the app works without it.
- **`api/`** (one per feature) uses relative `/api/…` URLs, parses every response with a shared schema, and throws `ApiError` with a readable message. `send` makes every mutating request JSON (the server requires it). A 401 anywhere invalidates `me` so the gate shows sign-in; the 409 with `VAULT_MISSING_MESSAGE` does the same for the vault page.
- **`AuthGate`** is the one place that decides what a signed-in user sees; pages never check auth. `RequireModule` layout routes hide a module's pages from a user without it; `moduleHome.ts` says where a user lands.
- Only route components and the navigation shell touch the router (`useParams`, `useNavigate`, `Link`, `useLocation`). The two exceptions that touch `window.location` are `useSignIn` and `useGmailRedirectNotice`. Downloads are plain `<a href="/api/…">` links.

## Note editor (`NoteEditor`)

Wraps MDXEditor; its stylesheet is the one CSS import in the app. Toolbar controls are MDXEditor's own components; before adding one, add what it writes to `test-support/noteFixtures.ts` and check the Markdown round trip — if MDXEditor writes something else, stop and ask. Dark mode is the `dark-theme` class toggled by hand with `classList`; **never make the editor's `className` depend on the colour scheme** (it recreates the popup container and orphans the Radix popups). The MDXEditor → MUI colour mapping lives in `theme.ts` because popups render under `<body>`.

## Accessibility and phone

Every input has a `<label>`; real `<button>` and `<a>`. Progress uses `role="status"`, errors `role="alert"`. Never colour alone for a state. Melete and Themis pages are phone-first: one column of at most 40rem, tap targets ≥ 44 px, no horizontal scroll.

## Style (differences from the server)

- One exported component per file, named exports, no defaults. Each component in its own PascalCase folder with an `index.ts` of exactly `export { Name } from './Name'`; import through the folder from outside, directly inside. Everything else camelCase with a role suffix.
- Components and hooks are `function` declarations with explicit types: `export function SubmitForm( { onSubmit }: SubmitFormProps ): ReactElement`. Everything else is a `const` arrow. Props types are local, named `<Component>Props`, destructured in the parameter list.
- Components are nouns; hooks `use…`; handler props `on…`; handlers inside `handle…`; booleans read as questions.
- Imports have no extensions. `#src/*` (a `paths` alias here, resolved by Vite) when a relative import would climb two levels.
- Keep state minimal, derive during render, no effects to compute values. Early returns for loading/empty/error. Module-level constants and lookup maps. No `useMemo`/`useCallback`/`memo` without a measured need. No wrapper, hook or utility for a single call site.
- A source file stays under ~150 lines; split by responsibility, not arbitrarily. Test files are exempt.
- JSX attributes in double quotes; `value={ url }`. MUI props first, then `sx`; a long `sx` becomes a module-level `<THING>_SX`. Shared styling goes in a `theme.ts` component override, not `styled()`. Theme spacing and palette keys, never rem or hex. No `.css` files. Import MUI by path (`@mui/material/Button`). Status labels in one `as const` map.

## Tests

- Test-first. Beside the source as `.test.ts(x)`. Never change or delete a test to make code pass.
- Query by role, label or text; never class or test id unless nothing else works. `userEvent` for interaction; fake timers for polling; never real sleeps.
- Mock at the boundary: component tests pass props; hook tests mock the feature's `api/` module and render through `renderHookWithClient`; components using queries, theme or router use `renderWithClient` (takes `route`, returns `location()`); `renderWithRouter( path, { me } )` renders the real `routes` with a cached signed-in user. `api/` tests stub `fetch` with `vi.stubGlobal`. No test touches the network.
- `mockMatchMedia` from `test-support/matchMedia.ts` for a narrow or dark window (the default is wide and light).
- MUI quirks: `Alert` puts `role="alert"` on its root, check `textContent`; a disabled MUI `Button` has `pointer-events: none`, give it `pointerEvents: 'auto'` in `sx` to click it; a tree item's name comes from its descendants unless it has an `aria-label`. jsdom needs the stubs in `test-support/setup.ts` for Radix Select and the link dialog.
- **Browser tests** (`*.browser.test.tsx`) only for behaviour that needs a real DOM: selection, focus, scrolling, layout (phone and desktop, light and dark). They import `userEvent` from `vitest/browser`, mock `api/` like jsdom tests, wait with `expect.poll`/`vi.waitFor`, and are typechecked by `tsconfig.browser.json`. The first run after a new dependency import can fail while Vite re-optimises; run again.
- After a UI slice, run the dev server with the server behind it, look at the page, and say what you saw. Passing tests don't prove a page looks right.
