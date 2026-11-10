# 0096. Fetched URLs are refused when they resolve to a private address

- Status: Accepted
- Date: 2026-11-10

## Context
`fetchResource` fetches whatever address a person types: an article, a feed, a feed's page. Nothing stops that address from naming the server's own network, so a job for `http://agent:8100/` or `http://169.254.169.254/` would make the server read an internal service and show the body to the user (server-side request forgery). Atlas has two users who sign in with Google, but the server still runs on a VM whose metadata endpoint and Compose network should not be reachable from a form field.

## Decision
- Before every request, including each redirect hop, `fetchResource` resolves the host with `dns.lookup( host, { all: true } )` and refuses the fetch if any resolved address is in `127/8`, `::1`, `0.0.0.0`, `::`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `fe80::/10` or `fc00::/7`, or is an IPv4-mapped form of one of them. A host written as an IP literal is checked the same way without a lookup.
- A refusal is `ValidationError( "That address can't be fetched" )`. It passes through `fetchResource` unchanged; a feed check records it as the feed's error like any other failure.
- A scheme other than http or https is still refused as before.
- `FETCH_ALLOW_PRIVATE=1` turns the guard off. The e2e fakes and the unit tests' local servers sit on loopback or the Compose network. Like `E2E_TEST_SIGNIN` it is refused at start unless `NODE_ENV=test`, and it is not in `.env.example`.
- `GEMINI_BASE_URL` and the YouTube base URL are not fetched through `fetchResource` and are unaffected.

## Consequences
- Follows TRD §3.1; it does not change the TRD.
- The address checked is not pinned for the connection. A DNS answer that changes between the check and the connect (DNS rebinding) gets through. Accepted: it needs an attacker-controlled DNS name and a signed-in user, and pinning would mean replacing `fetch`'s connection handling.
- A feed or site that legitimately lives on a private address can no longer be added.

## Alternatives considered
- **Pin the resolved address with a custom dispatcher:** closes the rebind gap, but adds an HTTP-agent layer (and possibly a dependency) for a two-user app.
- **An allow-list of hosts:** users add arbitrary sites and feeds.
- **Block at the network (Docker or VM firewall):** worth doing too, but the app should not rely on it, and unit tests can't see it.
