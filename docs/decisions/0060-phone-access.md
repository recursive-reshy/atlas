# 0060. Phone access: localhost-only port, Tailscale Serve, installable web app

- Status: Accepted (amended by 0061, 0077)
- Date: 2026-10-22

## Context
Melete is most useful for short reviews away from the desk. Mnemosyne runs on Naresh's Mac with no login, published by Compose on every network interface (`"3100:3100"`), which already exposes it to anyone on the same Wi-Fi.

## Decision
- **Compose binds the app to `127.0.0.1:3100`.** `localhost` works as before; other machines on the LAN can't connect.
- **Tailscale Serve** (`tailscale serve --bg 3100`), set up by Naresh and documented in `docs/phone-access.md`, gives a private `https://<machine>.<tailnet>.ts.net` address reachable only from his tailnet. **Funnel stays off.** No Tailscale code, dependency or configuration in the repo.
- **Installable, not offline:** a `manifest.webmanifest` (`start_url /melete`, standalone), icons including a maskable one and an Apple touch icon, and the iOS meta tags. No service worker, so no offline mode and no `vite-plugin-pwa`.
- Melete's pages are designed phone-first; other pages aren't redesigned.
- Gmail OAuth stays on `localhost` and is connected from the Mac.

## Consequences
- The app stays private without adding authentication; the trust boundary is Naresh's tailnet.
- The machine name appears in public Certificate Transparency logs when Serve gets its certificate; the guide says to choose a name that reveals nothing.
- The phone needs the Mac awake and online.
- A move to a cloud host later needs real authentication first; nothing here makes that harder.

## Alternatives considered
- **Expose on the LAN:** only works at home and leaves the app open on any shared network.
- **Tailscale Funnel or a public tunnel:** puts an unauthenticated app on the internet.
- **A full PWA with a service worker:** offline review isn't possible without the server for grading, and caching adds stale-version problems.
