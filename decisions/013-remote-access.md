---
status: proposed
applies_to: [web-inspection]
rule: osq serve binds only loopback; writes need an allowed host, a matching origin and the per-server token, one at a time, through the CLI command functions.
checks:
  - tests/web-actions.test.ts
---
# 013. Remote access

Date: 2026-10-08

## Status

Proposed. `osq-server` accepts it when it builds the configured hosts, and
ADR 009 then becomes superseded with `superseded_by: 013`. Until then ADR 009
governs.

## Context

ADR 009 lets `osq serve` approve, land, reject and retry on loopback. It
allows a request's host only as `127.0.0.1:<port>` or `localhost:<port>`, and
an origin only as `http://` followed by an allowed host.

A human who taps from a phone needs the dashboard on another device. A private
network brings it there without osq leaving loopback. An SSH tunnel to
`localhost:<port>` already passes ADR 009's checks. Tailscale Serve does not:
it terminates TLS on the tailnet and forwards to loopback, so the request
carries `Host: <machine>.<tailnet>.ts.net` and an `https://` origin, and ADR
009 refuses both.

Sign-in is deferred (ADR 014). Whoever can reach a port that osq writes on can
tap, so osq must not listen anywhere the private network does not already
guard.

## Decision

1. **`osq serve` binds only loopback**, in every mode, until a later ADR adds
   sign-in. No config key binds another address.
2. **Extra hosts come from config.** `serve.allowedHosts` lists host names,
   empty by default. A request's host is allowed as `127.0.0.1:<port>`,
   `localhost:<port>`, or an exact match of a listed entry. List `name` for a
   proxy on the default port, as Tailscale Serve sends it, and `name:port`
   otherwise.
3. **An origin is allowed as `http://` or `https://` followed by an allowed
   host.**
4. **Everything else in ADR 009 stands.** One token per server start, handed
   out only through the Host-checked `GET /api/actions/<id>`; every `POST`
   proves host, origin, JSON content type and `X-Osq-Token`; one action at a
   time; the CLI's command functions run every action.
5. **The private network is the boundary.** Anyone who reaches the loopback
   port through it can tap. The docs say so, and say that Tailscale Serve or a
   reverse proxy terminates TLS, never osq.

## Consequences

- Phone taps over Tailscale need `serve.allowedHosts` and `tailscale serve`,
  and no server code.
- With the default empty list, every request is judged exactly as under ADR
  009, so loopback use, the static export and their tests do not change.
- A listed name is trusted like `localhost`. A DNS-rebinding page can use it
  only if its owner controls that name, and a tailnet name belongs to the
  tailnet.

## Rejected

- **Binding `0.0.0.0` or a tailnet address.** Anyone on that network could tap,
  and there is no sign-in.
- **Accepting any host while bound to loopback.** It reopens the DNS rebinding
  attack ADR 009 closed.
- **A flag that turns the Host check off behind a proxy.** The same hole, one
  setting away.
- **Editing ADR 009 in place.** Decisions are superseded, not edited.
