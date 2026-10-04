---
status: accepted
applies_to: [web-inspection]
rule: osq serve writes only on loopback, for requests proving Host, Origin and a per-server token, one at a time, through the CLI's command functions.
checks:
  - tests/web-actions.test.ts
---
# 009. Loopback write actions

Date: 2026-10-04

## Status

Accepted

## Context

`osq serve` was read-only. A reviewer who wants to approve, land, reject, or
retry still needs a shell. The dashboard is already open in the browser, so the
change view should offer those four commands and run them where the CLI runs
them.

**Where the action table lives.** The command functions are in `src/cli/`, and
`tests/import-graph.test.ts` forbids `src/core/` from importing outside core.
So `startWebServer` takes a `runAction` port, typed in
`src/core/web/web-actions.ts`, the same way it already takes `getReport` and
`getInbox`, and `serveCommand` passes one built by `createWebActionRunner` in
`src/cli/serve-actions.ts`. A server without `runAction` behaves exactly as
before, so every existing serve test, the static export, and any other caller
keep their read-only server. The inbox launcher cannot be reused: it binds its
writers once and prints a `CommandError` as text, while a browser request needs
its own writers and the message and next step as separate fields.

**The threats.** Any web page the reviewer opens can send requests to
`127.0.0.1`. A cross-site form or `fetch` can post, though it cannot read the
answer; a JSON content type and a custom header force a CORS preflight the
server never approves, and the `Origin` check refuses it outright. With DNS
rebinding, a hostile name resolves to `127.0.0.1` and its page becomes
same-origin with the server, so it could read documents and post; its requests
carry the hostile `Host`, which both actions endpoints refuse, so it never sees
the token. The token is created per server start, reaches only osq's own page
through the Host-checked `GET /api/actions/<id>`, and every POST must echo it in
`X-Osq-Token`.

## Decision

`osq serve` exposes `GET /api/actions/<id>` and `POST /api/actions/<id>` only
when it was given a `runAction`. The server creates one token of 32 random
bytes from `node:crypto` per start. A request's host is allowed only as
`127.0.0.1:<port>` or `localhost:<port>` at the bound port, and an origin is
allowed only as `http://` followed by an allowed host.

The `GET` route returns 403 unless the host is allowed and any `Origin` is
allowed; otherwise it returns the change's actions document with the token. The
token reaches only osq's own page, because a rebinding page's `Host` is refused
before the document is built. `POST` is refused with 403 unless the host is
allowed, the `Origin` is present and allowed, the content type is
`application/json`, and `X-Osq-Token` equals the server's token under a
constant-time compare. Only a request that passes all of that has its body
read.

`getWebActions` derives the document from `readDispatchItems`, the same source
the inbox and card session use, so the browser offers exactly what `osq inbox`
offers; a change with no dispatch item shows its `readNextStep` `osq plan <id>`
as text. The command functions stay the authority: a tap on a stale button gets
the command's own refusal, error, and next step.

The server runs one action at a time. It reserves a gate before reading a body
and releases it in a `finally`, so a second write gets 409 and is never queued.
The action runs in the `osq serve` process, never as a child, through the same
command functions the CLI calls, so it writes exactly the files and events the
CLI writes and `osq show` and `osq report` cannot tell the tap from the command.
For ADR 003, a tap is a command the human runs, so a land from the browser
writes main the way `osq land` does.

## Consequences

- A reviewer can approve, land, reject, or retry from the change view without a
  shell, and the result shows the exit code, output, error, and next step.
- The dashboard is no longer read-only, so the CLI help and README no longer
  say it is.
- Any write path that trusts the browser must check `Host`, `Origin`, and a
  token; the per-server token means a stale tab's document stops working after a
  restart.
- The server's write handling lives in `src/core/web/web-write.ts`, so
  `web-server.ts` stays within the line budget and the guard is testable over
  raw HTTP.

## Rejected

- **A GET-reachable token on every path.** Under DNS rebinding the hostile page
  is same-origin and could read the token from any unguarded GET document, then
  post with it. Only the Host-checked actions document carries the token.
- **Origin checking alone.** Some clients send no `Origin`, so a missing header
  would pass; the token and JSON content type close that gap.
- **Running each action as a child `osq` process.** It costs a second Node
  start and returns text instead of a structured error and next step.
