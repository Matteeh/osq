---
title: The osq CLI works against a server
depends_on: ["161"]
verify: pnpm verify
features:
  reads: [metrics-and-reporting, spec-lint-and-approve, status-inspection, version-control, watcher-and-harness]
---
## Goal

The same `osq` binary can point at an osq server. With `OSQ_SERVER` set to
the server's project URL, such as `https://box.tail1234.ts.net/p/osq/`, the
CLI forwards each command to the server, which runs the same command
function on its own clone and streams the output back as NDJSON; the CLI
prints it and exits with the same code. Read commands and the human taps give
the same output as they give locally. A planner plans against the server:
`osq plan <id>` downloads the change folder to a working copy under
`~/.osq/remote/`, and `osq lint <id>` uploads it and lints on the server,
which refuses any path outside that change folder. Commands that only make
sense on one machine (`init`, `setup`, `migrate`, `watch`, `serve`, `doctor`,
`inbox`, `server`) refuse in one line naming the local alternative. With
`OSQ_SERVER` unset, nothing changes.

This builds ADR 014 decisions 3 and 6, on top of the `osq server` from 161.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
tests check the command and file endpoints over raw HTTP with their guards,
the NDJSON stream, and every upload refusal; the `OSQ_SERVER` values; the
forwarded runner against in-process calls on a fixture project, its failures,
its publishing land and its write order; plan download and lint upload
against a real server; the real CLI with and without `OSQ_SERVER`, and the
local-only refusals; and ADR 014's checks. Every existing test, each
`tests/serve*.test.ts` and `tests/server-command.test.ts` included, passes
unchanged.

## Non-goals

- Sign-in and scopes; ADR 014 decision 8 defers them, so anyone who reaches
  the server can forward any command, taps included, as they can tap today.
- `osq mcp`; that is `local-mcp`.
- Removing, deprecating or changing any local path. Without `OSQ_SERVER`, no
  command changes.
- A config key, a file, or a command that sets the server. `OSQ_SERVER` is
  the only setting.
- Planning a change that already ran (a steered replan) through the server,
  and creating a change from a brief file. `osq plan --next` and
  `osq plan <id>` for a queued change work; the rest run on the server over
  SSH.
- Getting new queue items or code onto the server. They reach its clone
  through `origin`, which a land tapped there fetches.
- Reading the server's code or specs from the working copy. The planner reads
  specs with `osq spec`, history with `osq query`, and code in its own
  checkout.
- Binary files in a change folder; uploads and downloads carry UTF-8 text.

## Surface

- Added: `OSQ_SERVER` (environment variable), the server's project URL; when set, the CLI forwards commands to it
- Added: `osq plan <id>` and `osq lint <id>` with `OSQ_SERVER` set download and upload a working copy under `~/.osq/remote/<host>/<project>/<folder>/`
- Added: the line `osq <name> runs only locally; unset OSQ_SERVER to run it here, or run it on the server` for `init`, `setup`, `migrate`, `watch`, `serve`, `doctor`, `inbox`, `server`, `plan --session`, `plan --brief` and `digest --out` with `OSQ_SERVER` set
- Added: the errors `OSQ_SERVER must look like https://<host>/p/<project>/: <value>`, `Could not reach the osq server at <base>: <reason>`, `osq server at <base> refused the request (<status>): <error>`, `osq server at <base> ended the command without an exit code`, and `osq plan <name> on a server needs an unapproved change with a brief; queue the brief and run osq plan --next`
- Added: `GET` and `POST /p/<project>/api/commands`, and `GET` and `PUT /p/<project>/api/files/<id>`, on `osq server` only
- Changed: a land forwarded to the server pushes to `origin`, as a land tapped there does
- Changed: ADR 014's `checks` list the forwarded-command and upload tests

## Decisions

- ADR 001: no config key is added, so the config loader does not change; the server comes from `OSQ_SERVER`.
- ADR 002: unchanged; the server's watcher archives exactly as today.
- ADR 004: unchanged; a forwarded `lint` runs the same validator call on the server.
- ADR 005: unchanged, for the same reason.
- ADR 010: unchanged; the validator still runs once at archive inside the watcher.
- ADR 012: the server worker gains a `runCommand`; its supervisor, restarts and build check do not change.
- ADR 013: the command and file paths use the same allowed-host, origin and token guard as the write actions, with their own token; forwarded writes and uploads run one at a time, writes through the CLI's command functions, and the server still binds only loopback.

## Assumptions

- Revised after 161 landed on 2026-10-10: 162 was stacked on 161's first run, and 161 was rerun from main after 160 before it landed. Approval restarts `osq/162-remote-cli` from main and all five tasks run again on 161's landed code.
- Every 161 name the tasks use (`startWebServer`'s site, `src/cli/server-worker.ts`, `src/cli/server.ts`, `tests/server-mode-adr.test.ts`) exists on main after 161 landed.
- 162's edits to existing files stay small (`src/cli/run.ts`, `src/cli/server-worker.ts`, `src/core/web/web-server.ts`, at 239 lines on main), so each stays within the 250-line budget.

## Contract

### Requirement: Forwarded commands

With `OSQ_SERVER` set, a forwarded command SHALL print what the same command
prints locally and exit with the same code.

#### Scenario: Same command from a laptop
- **WHEN** the CLI runs `osq show 001` with `OSQ_SERVER` set to a server over a project, and again in that project without it
- **THEN** stdout, stderr and the exit code are the same both ways

### Requirement: Change folder upload

The server SHALL refuse any uploaded path outside
`openspec/changes/<id>-<slug>/` and change no file.

#### Scenario: Upload refused outside the change folder
- **WHEN** an upload names `../x.md`
- **THEN** the server answers 400 with `path outside the change folder: ../x.md` and no file changes

### Requirement: Local use unchanged

With `OSQ_SERVER` unset, every command SHALL run locally exactly as before.

#### Scenario: No server set
- **WHEN** `OSQ_SERVER` is unset
- **THEN** `runCli` does not change the program and every existing test passes unchanged

## Human steps

### Before approval

None

### After landing

- Run `pnpm build`, then `osq server stop` and `osq server start` on the server, so the server worker serves the new paths.
- On the laptop, export `OSQ_SERVER=https://<tailnet name>/p/<project>/` in the shell, or in the editor's environment, that runs `osq` and the planner.

## Delta

- `specs/web-inspection/spec.md`: adds "Forwarded command endpoint" and "Change folder files on a server".
- `specs/cli-foundation/spec.md`: adds "Server setting", "Forwarded commands", "Commands that stay local" and "Planning against a server".

Five tasks, in order. Task 1 adds the command and file endpoints in
`src/core/web/`. Task 2 adds the server's command table and runner, wires it
into the server worker, and adds the client transport and the `OSQ_SERVER`
setting. Task 3 adds plan download and lint upload. Task 4 wires forwarding
into `runCli`, adds the local-only refusals, and writes the README section.
Task 5 lists the new tests in ADR 014's `checks`. No file is shared between
tasks.

## Background

**Why forward in-process.** ADR 014 decision 6 forwards whole commands, and
since 142 every command function takes `CommandInputs`, so the server calls
the command function with writers that emit NDJSON lines. Nothing in core
learns about a remote backend, and local and remote output cannot drift. The
server passes `cwd` but no `config`, so each command loads the config as it
does in a terminal.

**Why `OSQ_SERVER`.** The user chose it on 2026-10-09: setting it switches a
shell to the server, unsetting it switches back, and it needs no new file or
command. A planner session inherits it only from the shell or editor that
started it, so the README says to export it there.

**Write order.** Forwarded writes queue in the runner instead of failing with
409, because a CLI user cannot tap again; reads never wait, so `osq spec`
answers while a land runs. Uploads are short and refuse with 409 while
another one runs.

**Land.** A forwarded land is a land the server runs, so it publishes to
`origin` exactly as a land tapped on the server does (161).

**Plan.** `osq plan` runs on the server, where the specs, ADRs and history
are, so `plan-prompt.md` is the server's. The client downloads the folder and
rewrites only the handoff line's path. A plan for a name with no change and
brief is refused on the server, because `planCommand` would open `$EDITOR`
in the server worker.

**Measured on 2026-10-09** in a scratch worktree at `osq/161-osq-server`
(c51e343c) with a rough cut of every task: the CLI typecheck and build
passed, and against a server started with `startWebServer`, `status`,
`spec web-inspection`, `show 161`, `query` and `report --json` printed the
same bytes and exit codes forwarded as locally; plan downloaded and lint
uploaded a working copy, leaving `.run/` alone. 3561 of 3564 tests passed.
The three failures are frozen structural tests the tasks name:
`tests/change-locations-readers.test.ts` (new core code must use the change
locations module, not `getChangesDir`), `tests/cli-no-direct-output.test.ts`
(an exported function under `src/cli/` named `*Command`), and
`tests/cli-no-exit-code.test.ts` (a variable named `exit` with a type
annotation). `tests/server-mode-adr.test.ts` pins ADR 014's four checks;
task 5 owns it.
