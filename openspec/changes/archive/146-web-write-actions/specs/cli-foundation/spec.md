## ADDED Requirements

### Requirement: Dashboard command and configuration
The CLI SHALL provide `osq serve [--port <n>] [--open]`. It SHALL bind a Node
`http` server only to `127.0.0.1`, print the actual listening URL, optionally
launch that URL in the platform default browser after listening, and close its
HTTP and filesystem-watch resources on SIGINT or SIGTERM. It SHALL never start
the execution watcher. It SHALL write a project, cursor, change, or marker
file only by running an action a request to `/api/actions/<id>` asked for,
through `createWebActionRunner`.

Public configuration SHALL contain
`serve: { port: number, eventDebounceMs: number }`, defaulting to port `4173`
and a 100 millisecond debounce interval. Both values SHALL be validated, with
the debounce required to be finite and non-negative. `--port` SHALL take precedence
over configuration and accept only integer ports from 0 through 65535; zero
SHALL request an operating-system-assigned port. Browser launch SHALL use
platform facilities without a new runtime dependency. Startup failure,
including `EADDRINUSE`, SHALL report an actionable error and exit nonzero
without launching a browser or retaining a watcher.

#### Scenario: Configured loopback server
- **WHEN** a user runs `osq serve` without a CLI port
- **THEN** the server listens on `127.0.0.1` at `serve.port` and prints its exact URL after listening

#### Scenario: CLI port precedence
- **WHEN** `--port 0` or another valid port is supplied
- **THEN** it overrides configuration and the command reports the actual bound loopback port

#### Scenario: Invalid or unavailable port
- **WHEN** a port is outside the valid integer range or cannot be bound
- **THEN** the command exits nonzero without opening a browser or leaving server resources running

#### Scenario: Open in default browser
- **WHEN** `--open` is supplied and the server begins listening
- **THEN** the command launches the printed loopback URL once through the current platform's default-browser command

### Requirement: Dashboard actions run in-process
`serveCommand` SHALL pass `startWebServer` a `runAction` built by
`createWebActionRunner({ cwd, config }, commands?)` from
`src/cli/serve-actions.ts`, with the command's `cwd` and loaded config. The
runner SHALL call, in the same process and never through a child process, the
command function for the request's verb, with `cwd`, `config`, and a
`stdout` and `stderr` writer that each collect that request's text:

- `approve`: `approveCommand([change], inputs)`.
- `land`: `landCommand(change, inputs)`.
- `reject`: `rejectCommand(change, { ...inputs, reason })`.
- `retry`: `retryCommand(change, target, inputs)`.

It SHALL resolve a `WebActionResult` with exit code 0 and `error` null when
the command resolves. When the command throws a `CommandError`, the result
SHALL carry its `exitCode` and `error` with its message and its `next` or
null. Any other thrown value SHALL give exit code 1 and `error` with message
`Error: <message>` and next null. The result SHALL always carry the collected
stdout and stderr. The runner SHALL never reject, set `process.exitCode`,
end the process, or write to a process stream. `commands` SHALL default to
the table above; a test may pass its own table of the same shape.

An action run this way SHALL write exactly the files and events the same
CLI command writes, so `osq show` and `osq report` read a browser action as
they read the command.

#### Scenario: Each verb reaches its command
- **WHEN** a runner built with a recording table runs `approve`, `land`, `reject` with reason `r`, and `retry` with target `2` for change `001`
- **THEN** each table entry is called once with change `001`, its reason or target, and the runner's `cwd` and config

#### Scenario: Failure carries the error and next step
- **WHEN** a command throws a `CommandError` with message `Error approving 001:`, exit code 1, and next `osq lint 001`, and another throws `new Error('boom')`
- **THEN** the results are exit code 1 with that message and next, and exit code 1 with `Error: boom` and next null

#### Scenario: Browser approve records like the CLI
- **WHEN** one ready change is approved through `osq serve`'s `POST /api/actions/<id>` and a twin project's change through `approveCommand`
- **THEN** both changes have `.run/approved` and the same sequence of event types

## REMOVED Requirements

### Requirement: Read-only dashboard command and configuration
**Reason**: `osq serve` now writes files when the dashboard asks for an approve, land, reject, or retry, so "never write a project, cursor, change, or marker file" no longer holds.
**Migration**: None. "Dashboard command and configuration" keeps every other sentence and all four scenarios, and "Dashboard actions run in-process" says how the writes happen.
