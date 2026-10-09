---
title: osq runs on a server reachable over a private network
depends_on: ["159"]
verify: pnpm verify
features:
  reads: [metrics-and-reporting, spec-lint-and-approve, status-inspection]
---
## Goal

osq can run as a server for one project. `osq server start` runs the
dashboard, its HTTP API and the watcher service in the background from the
server's own clone, under the ADR 012 supervisor; `osq server stop` stops
them. The server binds only loopback and is reached from a phone or laptop
through a private network: Tailscale Serve or an SSH tunnel. A human can
approve, land, reject and retry from a browser that is not on the server.
A land tapped there fetches `origin`, pushes the land commit to `origin` as a
fast-forward before it moves the server's branch, and stops when `origin`
moved. The served dashboard names the server and project it is on and shows
what the watcher service is doing.

This builds ADR 013 (configured hosts, which then supersedes ADR 009) and the
parts of ADR 014 that need no CLI forwarding. `osq serve` on loopback and
`osq land` in a terminal behave exactly as before.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
tests check the `serve.allowedHosts` and `serve.server` config; the write
guard over raw HTTP with a configured host and an `https://` origin; the
`Vcs` fetch and push against a bare repository in a temporary folder as
`origin`; a publishing land that pushes, catches up, stops when `origin`
moved, and stops on divergence; the supervisor running a server worker with
an injected spawn and clock; the `/p/<project>/` paths and the status
document; `osq server start` and `stop` as real processes on a temporary
project and home; the dashboard header and service panel; and ADRs 013, 009
and 014. Every existing `osq serve` test passes unchanged.

## Non-goals

- Sign-in and scopes; ADR 014 defers them.
- The CLI talking to a server, change-folder upload, and `osq mcp`; those are
  `remote-cli` and `local-mcp`.
- The phone app, and TLS in osq. Tailscale Serve or a reverse proxy
  terminates TLS; the README says so.
- Landing through a forge PR, and a server with no `origin`. ADR 014 names
  both and builds neither; without `origin` a tapped land stops at the fetch.
- Binding any address other than `127.0.0.1`.
- A push from `osq land` in a terminal. Only a land the server runs pushes;
  a terminal land's commit goes out with the next land the server runs.
- Serving several projects from one server. Paths sit under `/p/<project>/`
  so that is additive later.
- A server line in `osq status` or `osq --json`.

## Surface

- Added: `osq server start` and `osq server stop` (commands)
- Added: `serve.allowedHosts` (config key, default `[]`)
- Added: `serve.server` block with `port`, `buildCheckSeconds`, `name` and `project` (config keys)
- Added: `timeouts.gitRemoteSeconds` (config key, default 120)
- Added: `ServeServerConfig` type exported from `src/index.ts`
- Added: `OSQ_SERVER_ROLE` environment variable (`supervisor`, `worker`), set by osq for its own processes
- Added: `server.json`, `server.log` and `server.log.1` under `~/.osq/watch/<hash>/`
- Added: `/p/<project>/` paths, `/p/<project>/api/server`, and the redirect from `/` on a server
- Added: project and server name in the dashboard header, and a Service panel on the home view, on a server only
- Added: land output lines `Updated <branch> to origin/<branch>` and `Pushed <commit> to origin/<branch>`, and the land stops `Could not fetch origin/<branch> ...`, `<branch> and origin/<branch> have diverged ...` and `origin/<branch> moved while landing ...`, on a server land only
- Changed: the write guard also allows the hosts in `serve.allowedHosts` and `https://` origins of allowed hosts
- Changed: ADR 013 becomes accepted, ADR 009 becomes superseded by it, and ADR 014's `checks` lists its tests

## Decisions

- ADR 001: the `serve.allowedHosts` and `serve.server` keys load through the existing jiti config loader; no loader is added.
- ADR 002: unchanged; the server's watcher archives exactly as today.
- ADR 004: unchanged; no validator call is added or moved.
- ADR 005: unchanged; no validator call is added or moved.
- Departs from ADR 009: the write guard also allows the hosts in `serve.allowedHosts` and `https://` origins, as the proposed remote-access decision `decisions/013-remote-access.md` says for the private network; task 8 accepts that decision and marks ADR 009 superseded by it. Everything else ADR 009 decided holds, and its tests pass unchanged.
- ADR 010: unchanged; the validator still runs once at archive inside the watcher.
- ADR 012: the server runs under the same supervisor as the watch service, with the same restart backoff, the same exit 75 on a settled new build, and its records in the same `~/.osq/watch/<hash>/` folder; the supervisor still never builds osq or runs git.

## Assumptions

- Revised after 160 landed: 160 and 161 both add a member to `OsqUserConfig`'s key union in `src/core/foundation/config-user.ts`, so approval restarts `osq/161-osq-server` from main and all eight tasks run again on top of 160.
- `src/core/web/web-write.ts` is 228 lines on main after 160; task 1's guard changes added about 20 lines before, which still fits the 250-line budget.
- 160's new tests (`tests/web-notices.test.ts`, `tests/ui-notices.test.tsx` and the rest) use loopback `osq serve` paths that 161 keeps unchanged, so they pass without being in any task's scope.

## Contract

### Requirement: Server commands

`osq server start` SHALL run the dashboard, its HTTP API and the watcher
service in the background for the project, and `osq server stop` SHALL stop
them. A land tapped on the server SHALL push to `origin`.

#### Scenario: Start and stop
- **WHEN** a user runs `osq server start` in a project with no live watcher and then `osq server stop`
- **THEN** start prints the server's URL under `/p/<project>/`, a server and a watch service run until stop, and after stop neither runs

#### Scenario: Tap land on a server
- **WHEN** a land runs through the server's `POST /p/<project>/api/actions/<id>` and `origin`'s default branch equals the server's
- **THEN** `origin`'s default branch and the server's both hold the land commit

#### Scenario: Loopback serve unchanged
- **WHEN** a user runs `osq serve`
- **THEN** it behaves as before: no `/p/` paths, no `api/server`, no push, and its tests pass unchanged

## Human steps

### Before approval

- Run `pnpm build` in the checkout and restart `osq watch`, so the watcher that reruns 161 has 160's code.

### After landing

- Run `pnpm build`, then restart the watch service with `osq watch --stop` and `osq watch --background`, so the supervisor itself runs the new code.
- To use a server: on the server's clone, set `serve.allowedHosts` to the Tailscale Serve name in `osq.config.ts`, make sure osq's git can push to `origin` with the server user's git or SSH setup, run `osq server start`, then `tailscale serve --bg <serve.server.port>`. The README's server section has the steps.

## Delta

- `specs/web-inspection/spec.md`: modifies "Loopback write actions" with the configured hosts and `https://` origins, keeping all eight scenarios, 160's "Approve with opened notices" among them, and adding two; adds "Project paths on a server" and "Server header and service panel".
- `specs/cli-foundation/spec.md`: adds "Server configuration" and "Server commands".
- `specs/version-control/spec.md`: modifies "Operations osq never runs" so `pushBranch` is the one push, keeping its scenario and adding one; adds "Vcs remote operations" and "Land publishes to origin".
- `specs/watcher-and-harness/spec.md`: adds "Server state files" and "Server supervisor".

Eight tasks, in order. Task 1 builds ADR 013's code: the config keys and
the write guard. Task 2 adds fetch and push to the `Vcs`
port. Task 3 adds the publishing land and the `publish` option on
`landCommand`. Task 4 adds the server records and lets the supervisor run a
server worker. Task 5 adds the `/p/<project>/` paths and the status
document to `startWebServer`. Task 6 adds `osq server start` and `stop`,
the server worker, and the README section. Task 7 adds the dashboard header
and service panel. Task 8 accepts ADR 013, supersedes ADR 009 with it, and
lists ADR 014's checks; it comes last so every check file exists. No file is
shared between tasks.

## Background

**Why `osq server` and not a flag on `osq serve`.** The user chose a separate
command on 2026-10-09. A separate process is what makes server behaviour
opt-in: only the server worker passes `startWebServer` a `site` (the
`/p/<project>/` paths and the status document) and only its action table
lands with `publish`. `osq serve` builds neither, so it cannot change.

**Why only a server land pushes.** Also the user's choice. ADR 003 lets osq
write main only through a command the human runs; a tap is one (ADR 009). A
terminal `osq land` on the server is local mode (ADR 014 decision 2) and stays
as it is; its land commit reaches `origin` with the next server land, because
that push carries every commit below the new one.

**Push before move.** A publishing land builds the land commit, pushes it to
`origin` first, and moves the server's branch only after `origin` took it. If
`origin` moved during the land, the push is refused, the server's branch is
where it was, and tapping land again fetches, fast-forwards the server's
branch to `origin`, syncs the change, and builds a new land commit. Moving
first and pushing second would leave a land commit `origin` refuses and no
way forward without a merge or history rewrite.

**Credentials.** The push runs in osq's own git process with the server
user's git and SSH setup and `GIT_TERMINAL_PROMPT=0`, so a missing credential
fails instead of waiting for a terminal. No role environment gains a
variable (ADR 007); executors and verify run in the watcher's processes with
their declared environments, unchanged.

**Paths.** The dashboard is built with relative asset URLs and a hash router,
so it already works under any folder. On a server the client prefixes every
API request with `/p/<project>/`; on loopback it requests `/api/...` as
today and never asks for `api/server`.

**Measured on 2026-10-09** in a scratch worktree at 121797bc with a rough cut
(ADR 013 accepted and 009 superseded, `allowedHosts` and the `server` block
in the serve defaults, `fetchBranch` and `pushBranch` on the `Vcs` port, a
`server` command in the "Setup and running" group, and `server` in
`WatchRecordName`): the CLI and UI typechecks passed, and 3517 of 3524 tests
and 130 of 130 UI tests passed, against all passing on a clean tree. The
failures are `tests/config.test.ts` (three serve config cases), owned by
task 1 with `tests.modify: true`; `tests/remote-access-adr.test.ts`, owned by
task 8;
`tests/vcs-write.test.ts` (the port member list), owned by task 2;
`tests/help-groups.test.ts` and `tests/readme-command-groups.test.ts`, owned
by task 6, the second passing once README lists `osq server`. The rough cut
hid `push` from the forbidden-argument check, which task 2 also changes.
`tests/server-mode-adr.test.ts` pins ADR 014's empty `checks`; task 8 owns
it.
