---
queue_item: osq-server
queue_hash: sha256:3623a3d6100ff9cd9e957ace1fa1304bb4f84ca88d1c534fb12a1cc442d672f0
planner: null
date: 2026-10-08
---

### Goal

osq can run as a server for a project: the watcher service, the dashboard and the HTTP API, run from the server's own clone, reachable from a phone or laptop over a private network such as Tailscale or an SSH tunnel. A human can approve, land, reject and retry from a browser that isn't on the server, and a land pushes the result to `origin`. Today's loopback `osq serve` keeps working unchanged.

### Context

As of 2026-10-08:

- `osq serve` (`src/cli/serve.ts`, `src/core/web/web-server.ts`) binds `127.0.0.1` on `serve.port` (default 4173, `src/core/foundation/config-serve.ts`). It serves `packages/ui` from `ui/dist` and `/api/report`, `/api/graph`, `/api/system`, `/api/inbox`, `/api/events`, `/api/changes/` and `/api/actions/`. Write actions are in `web-write.ts` and `web-actions.ts`, under ADR 009, which allows only the hosts `127.0.0.1` and `localhost`.
- `osq watch --background` and `--stop` run the watcher under the supervisor from 155 (ADR 012, `src/cli/watch-service.ts`).
- The dashboard has approve (148) and land (153) views.
- 159 wrote ADR 013 (remote access, proposed, to supersede ADR 009) and ADR 014 (server mode). Sign-in is deferred; its requirement is on the Notion page "Server, UI and MCP".

### Requirements

- First, ADR 013 built: the write guard allows the configured hosts and their `https://` origins as well as loopback, osq still binds only loopback, and ADR 013 becomes accepted while ADR 009 becomes superseded by it. Phone taps over Tailscale Serve work after this step alone.
- Whatever else ADR 014 decides for the server, built: starting and stopping the server under the ADR 012 supervisor, API paths under `/p/<project>/`, land pushing the land commit to `origin` as a fast-forward and stopping when the remote moved, and the dashboard header and service panel.
- Every limit, port, host and lifetime comes from config.
- `osq serve` on loopback behaves exactly as before, and its tests pass unchanged.

### Non-goals

- Sign-in and scopes; deferred by ADR 014.
- The CLI talking to a server; that is `remote-cli`.
- MCP, the phone app, TLS termination (Tailscale Serve or a reverse proxy does it; say so in docs).
- Landing through a forge PR, or a server with no `origin`; ADR 014 names both and builds neither.

### Notes for planning

- The dashboard must show which server and project it is on, and what the watcher service is doing.
- Push credentials belong to osq's own git process and never reach the executor or verify (ADR 007).
