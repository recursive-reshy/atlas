# 0109. A Home screen at `/`; the transcriber moves to `/transcriber`

- Status: Accepted
- Date: 2026-11-10

## Context
1.2 adds a broad overview of where time goes relative to goals, as its own landing page, with later cards (due today, to-dos) in mind. `/` is Mnemosyne's job list today (component `HomePage`), Themis is first in the drawer (ADR 0092), and the PWA opens `/melete`.

## Decision
**Routes.**
- Home is `/`.
- The transcriber (labelled Mnemosyne) moves to `/transcriber` and `/transcriber/jobs/:id`; `/jobs/:id` redirects there. The path uses the module's internal ID, as ADR 0073 requires for routes, so the name guard needs no change for it.
- The component `HomePage` is renamed `TranscriberHome`.
- Calendar review is `/themis/calendar` with **Drafts** and **Rules** tabs, behind the Themis module.

**Not a module.** Home is not in `ModuleId` and has no admin toggle. It is made of cards contributed by modules and owns no data.
- In 1.2 only Themis contributes, so Home shows (in the drawer and as the landing page) only for users with Themis. Other users see no change.

**Drawer and landing.**
- Drawer order: Home, Themis, Mnemosyne, Melete.
- `homeFor` returns `/` when Home applies, otherwise the first module as today.
- The PWA `start_url` becomes `/`.

**Cards in 1.2.**
- **Where the time went:** time per area for week, month or quarter, split by measured, logged and calendar, with the top goals by time.
- **Drafts waiting:** links to `/themis/calendar`.
- **Connect Google Calendar:** a dismissible prompt when not connected.

**No `/api/home`.**
- Cards call their modules: `GET /api/themis/overview` gains the `calendar` source and a `calendar_drafts` count.
- Opening Home triggers `POST /api/calendar/sync` when connected (ADR 0108).

## Consequences
- Old `/` bookmarks now open Home; the transcriber is one tap away. Links to jobs keep working through the redirect.
- Adding a card later (due today, to-dos) doesn't touch the others.

## Alternatives considered
- **Home as Themis's landing page:** mixes the life-level overview with goal management, and leaves no place for other modules' cards.
- **Home at `/home`, the transcriber stays at `/`:** keeps the oldest URL but makes the app's front door a sub-path.
- **Home as a module with a toggle:** it holds no data of its own to switch off.
- **`/mnemosyne` as the path:** matches the label, but ADR 0073 keeps the internal ID `transcriber` in routes.
