---
title: The dashboard can approve, land, reject and retry on loopback
depends_on: []
verify: pnpm verify
features:
  reads: [status-inspection, spec-lint-and-approve, watcher-and-harness, version-control, metrics-and-reporting]
---
## Goal

`osq serve` accepts approve, land, reject and retry from the browser on
127.0.0.1. The change view shows the buttons that apply to the change, and a
tap runs the same command function the CLI and the inbox card session run, in
the `osq serve` process, then shows the command's output, exit code, error
and next step. A reviewer can tap a decision without a shell, and `osq show`
and `osq report` cannot tell the tap from the command. A new ADR says why
writes are allowed on loopback and what protects them. This is M2 item 1.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
`tests/web-actions.test.ts` drives `startWebServer` with a recording
`runAction` over raw HTTP: every request without proof is refused before
the runner is called, a second write while one runs gets 409, bad bodies get
400, and the actions document lists what the inbox lists for the change.
`tests/serve-actions.test.ts` proves each verb reaches its real command, that
failures carry the command's error and next step, and that an approve tapped
through `serveCommand`'s server records the same events as `approveCommand`.
`tests/ui-actions.test.tsx` renders the buttons and results, checks the
client's requests, and taps through a real server.

## Non-goals

- Planning from the browser. The change view shows `osq plan <id>` as text;
  planning sessions in the app are M4.
- Authentication, remote access, or binding anything but loopback (M3).
- The approve view's content; that is `approve-view`.
- A confirmation dialog or a second click. ADR 006 makes a tap one decision.
- Showing actions on the inbox or changes list; only the change view gets
  buttons.
- Protecting the existing GET documents against DNS rebinding. They behave
  exactly as today; only the new actions document checks `Host`.
- A body size limit. The body is read only after the token check, so only
  osq's own page can send one.

## Surface

- Added: `GET /api/actions/<id>` and `POST /api/actions/<id>` on `osq serve` (HTTP endpoints), with the `X-Osq-Token` request header.
- Added: `Approve`, `Land`, `Reject` and `Retry` buttons and the action result in the dashboard's change view.
- Changed: `osq serve`'s help line and README line no longer call the dashboard read-only.
- Added: `decisions/009-loopback-write-actions.md` (ADR 009).

## Decisions

- ADR 001: unaffected; the runner uses the config `osq serve` already loaded and loads no other.
- ADR 004: unaffected; an approve from the browser runs the validator exactly as `osq approve` does.
- ADR 005: unaffected; the validator range check is the same in-process.
- No accepted ADR governs web-inspection yet. Task 1 writes ADR 009, applying to web-inspection, with the rule under "The new ADR" in Background.

## Contract

### Requirement: Loopback write actions

`osq serve` SHALL run approve, land, reject and retry only for a request that
proves it came from osq's own page on loopback: an allowed `Host`, an
allowed `Origin`, a JSON body, and the server's token. A request that fails
SHALL be refused before any state changes, and one write SHALL run at a time.

#### Scenario: Write without proof
- **WHEN** a POST to `/api/actions/001` lacks the token or carries another site's `Origin`
- **THEN** the server returns 403 and changes no file

#### Scenario: One write at a time
- **WHEN** a second valid POST arrives while the first action has not finished
- **THEN** it returns 409 without running

### Requirement: Dashboard actions run in-process

A tap SHALL call the same command function the CLI runs, in the `osq serve`
process, and answer with its exit code, output, error and next step.

#### Scenario: Browser approve records like the CLI
- **WHEN** a ready change is approved through the dashboard and a twin through `approveCommand`
- **THEN** both have `.run/approved` and the same event types

## Human steps

### Before approval

None

### After landing

- Run `pnpm build` in this checkout, because the globally linked `osq` runs `dist/` and `ui/dist`.

## Delta

- `specs/web-inspection/spec.md`: removes "Read-only HTTP transport" and adds
  "Loopback HTTP transport", which keeps all of it except POST on the actions
  path; adds "Loopback write actions" and "Change actions".
- `specs/cli-foundation/spec.md`: removes "Read-only dashboard command and
  configuration" and adds "Dashboard command and configuration", which keeps
  all of it except the never-writes sentence; adds "Dashboard actions run
  in-process".

Three tasks, in order. Task 1 writes the server side in `src/core/web/` and
ADR 009. Task 2 writes the runner in `src/cli/` and passes it from
`serveCommand`. Task 3 writes the browser side and reads both. No file is
shared between tasks.

## Background

**Where the action table lives.** The command functions are in `src/cli/`,
and `tests/import-graph.test.ts` forbids `src/core/` from importing outside
core. So `startWebServer` takes a `runAction` port, typed in
`src/core/web/web-actions.ts`, the same way it already takes `getReport` and
`getInbox`, and `serveCommand` passes one built by `createWebActionRunner` in
`src/cli/serve-actions.ts`. A server without `runAction` behaves exactly as
today, so every existing serve test, the static export, and any other caller
keep their read-only server.

**Why not reuse `createActionLauncher`.** The inbox launcher binds its
writers once and prints a `CommandError` as text. A browser request needs its
own writers and the message and next step as separate fields. The runner is a
second small table of the same four functions, plus `land`, which the card
session leaves for the human to copy.

**Which buttons apply.** `readDispatchItems` already decides what needs a
human for each change and which commands to offer, for the inbox and the card
session. The actions document reuses it, so the browser offers exactly what
`osq inbox` offers: approve for a change ready for approval, retry for a dead
or regressed task, retry and reject for a change-level regression, land for a
change archived in a worktree, and `osq plan <id>` as text for steering. An
unplanned change has no dispatch item, so its next step's `osq plan <id>`
shows as text. The command functions stay the authority: a tap on a stale
button gets the command's own refusal and next step.

**The threats.** Any web page the reviewer opens can send requests to
`127.0.0.1`. A cross-site form or `fetch` can post, though it cannot read
the answer; a JSON content type and a custom header force a CORS preflight
the server never approves, and the `Origin` check refuses it outright. With
DNS rebinding, a hostile name resolves to `127.0.0.1` and its page becomes
same-origin with the server, so it could read documents and post; its
requests carry the hostile `Host`, which both actions endpoints refuse, so it
never sees the token. The token is created per server start, reaches only
osq's own page through the Host-checked `GET /api/actions/<id>`, and every
POST must echo it in `X-Osq-Token`.

**The new ADR.** Task 1 writes `decisions/009-loopback-write-actions.md`,
accepted, applying to web-inspection, with the rule: osq serve writes only on
loopback, for requests proving Host, Origin and a per-server token, one at a
time, through the CLI's command functions. It also says that, for ADR 003, a
tap is a command the human runs, so a land from the browser writes main the
way `osq land` does.

**Measured on 2026-10-04** in a scratch worktree at 145 with a rough cut: an
optional `runAction` on `startWebServer` that answers POST on
`/api/actions/`, `serveCommand` passing one, and an optional actions prop on
`ChangeView`. After `pnpm build`, every `tests/serve*`, `tests/web*`,
`tests/ui*`, import-graph, line-budget, function-budget,
`cli-no-direct-output` and UI budget test passed (202 tests), and both
typechecks passed. No existing test changes. `src/core/web/web-server.ts` is
at 243 of its 250 lines, so task 1 moves its response helpers into a new
`src/core/web/web-http.ts` and keeps `serializeWebJson` exported from
`web-server.ts`. `startWebServer` is grandfathered by the function budget;
the write handling goes in new files so it does not grow much.
`tests/cli-no-direct-output.test.ts` requires every exported `*Command`
function under `src/cli/` to be in its table, so the runner file exports no
function with that suffix.
