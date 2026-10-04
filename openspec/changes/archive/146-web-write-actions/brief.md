---
queue_item: web-write-actions
queue_hash: sha256:64af368bb94124871ccd55470e773fa963903bdea9279da9816c8caa0ab8ed2d
planner: null
date: 2026-10-04
---

### Goal

`osq serve` accepts approve, land, reject and retry from the browser on 127.0.0.1, running the same command functions the CLI and the inbox card session run, so a reviewer can tap a decision without a shell. This is M2 item 1.

### Context

As of 2026-10-04:

- The living requirement "Read-only HTTP transport" (web-inspection) says GET and HEAD are the only methods and every other method returns 405 with `Allow: GET, HEAD` before route lookup. Its scenario "Mutation method is refused" pins that. `src/core/web/web-server.ts` implements it and binds `127.0.0.1`.
- Change 144 made `osq inbox` run card keys in-process: `createActionLauncher` in `src/cli/inbox-actions.ts` maps `approve`, `plan`, `retry`, `reject` and `show` to their command functions with `cwd`, `config`, `stdout` and `stderr` (142's `CommandInputs`), and turns a `CommandError` into its message and next step. `land` is not in that table.
- `osq approve` asks on stdin only with `--confirm`. `osq plan` hands the terminal to an interactive planner, so it cannot run from a browser.
- The web server lives in `src/core/web/` and the command functions in `src/cli/`. Core does not import from `src/cli/` today, and `tests/import-graph.test.ts` freezes the import graph.
- ADR 006: a tap is a single decision (approve, land, reject or retry), and before each tap osq shows the evidence it has.

### Requirements

- A new ADR allows write endpoints on loopback only and says what protects them. It names the threats: another site's page posting to `127.0.0.1` (cross-site request forgery) and DNS rebinding. Every write request must prove it came from osq's own page, for example by an `Origin` and `Host` check plus a per-server token the page receives, and a request that fails is refused before any state changes.
- `POST` endpoints for approve, land, reject (with a reason) and retry (with a target) call the command functions in-process with captured writers, and answer JSON with the exit code, the captured output, and on failure the `CommandError` message and next step.
- GET and HEAD behave exactly as today. Every other method and path still returns 405 with no state change.
- One write runs at a time per server; a second request while one runs is refused, not queued.
- The dashboard's change view shows the action buttons that apply to the change's state, and the result after a tap.
- Each write is recorded the way the same CLI command records it, so `osq show` and `osq report` cannot tell a browser tap from a shell command.

### Non-goals

- Plan from the browser. The change view shows the `osq plan <id>` command instead; planning sessions in the app are M4.
- Authentication, remote access, or binding anything but loopback (M3).
- The approve view's content; that is `approve-view`.

### Notes for planning

- "Read-only HTTP transport" changes behaviour, so it is a REMOVED requirement plus an ADDED one, or a MODIFIED one that keeps "Mutation method is refused" for paths that are not write endpoints.
- Decide where the action table lives so core never imports `src/cli/`, for example `osq serve` passing actions into the server; say why.
- Measure test fallout in a scratch worktree first: web tests pin the 405 response.
