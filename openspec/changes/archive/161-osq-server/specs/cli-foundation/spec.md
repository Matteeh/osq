## ADDED Requirements

### Requirement: Server configuration
`validateServeConfig` SHALL also validate two optional keys of the `serve`
block and put them on `OsqConfig.serve`:

- `allowedHosts`: default `[]`. Host names the write guard accepts besides loopback, each `name` or `name:port`.
- `server`: the `osq server` settings, each defaulted on its own:
  - `port`: 4174. The loopback port the server binds.
  - `buildCheckSeconds`: 30. How often the server worker checks for a new osq build.
  - `name`: optional. The server's name the dashboard shows; when unset, the server uses `os.hostname()`.
  - `project`: optional. The project's path segment in `/p/<project>/`; when unset, the server uses the project root's folder name with every character other than a letter, digit, `.`, `_` or `-` replaced by `-`.

An invalid value SHALL throw the error in the table, and a partial block SHALL
keep each missing value's default. `OsqUserConfig` SHALL accept `serve` with
every key optional, `serve.server` included. `src/index.ts` SHALL export the
`ServeServerConfig` type. The existing `port` and `eventDebounceMs` keys and
their errors SHALL not change.

| Value | Error |
|---|---|
| `allowedHosts` not an array, or an entry that is not a non-empty string, or holds whitespace, `/` or `://` | `serve.allowedHosts must be an array of host names` |
| `server.port` not an integer from 1 through 65535 | `serve.server.port must be an integer from 1 through 65535` |
| `server.buildCheckSeconds` not a finite number greater than zero | `serve.server.buildCheckSeconds must be a finite number greater than zero` |
| `server.name` not a non-empty string | `serve.server.name must be a non-empty string` |
| `server.project` not matching `^[A-Za-z0-9][A-Za-z0-9._-]*$` | `serve.server.project must start with a letter or digit and hold only letters, digits, '.', '_' or '-'` |

#### Scenario: Server defaults
- **WHEN** `defineConfig({})` runs
- **THEN** `serve` is `{ port: 4173, eventDebounceMs: 100, allowedHosts: [], server: { port: 4174, buildCheckSeconds: 30 } }`

#### Scenario: Partial server block
- **WHEN** `defineConfig({ serve: { server: { port: 4180 } } })` runs
- **THEN** `serve.server` is `{ port: 4180, buildCheckSeconds: 30 }` and `serve.port` is 4173

#### Scenario: Invalid server values
- **WHEN** `defineConfig` runs with each value below
- **THEN** it throws an error naming the key:

| Input | Key named |
|---|---|
| `{ serve: { allowedHosts: 'box' } }` | `serve.allowedHosts` |
| `{ serve: { allowedHosts: ['https://box'] } }` | `serve.allowedHosts` |
| `{ serve: { server: { port: 0 } } }` | `serve.server.port` |
| `{ serve: { server: { buildCheckSeconds: 0 } } }` | `serve.server.buildCheckSeconds` |
| `{ serve: { server: { name: '' } } }` | `serve.server.name` |
| `{ serve: { server: { project: 'a/b' } } }` | `serve.server.project` |

### Requirement: Server commands
The CLI SHALL provide `osq server start` and `osq server stop`, in the "Setup
and running" help group, and README's command list SHALL name both.

`osq server start` SHALL fail before it starts anything with `osq server is
already running (pid <pid>). Log: <log>. Stop it with osq server stop` when
`readServerRecord` returns a live record; a process with `OSQ_SERVER_ROLE`
set is exempt from this check and from starting the watch service. Otherwise
it SHALL start the watch
service exactly as `osq watch --background` does, printing its line, when
`readWatchState` returns no live service or watcher record, and leave a live
one alone. It SHALL then spawn the same Node executable with its `execArgv`,
the `osq` entry it runs from, and `server start`, as a detached process with
`OSQ_SERVER_ROLE=supervisor`, its stdout and stderr appended to `server.log`;
write `server.json` with the child's pid, `startedAt`, the log path, and the
URL `http://127.0.0.1:<serve.server.port>/p/<project>/`; and print `osq server
is running in the background (pid <pid>) at <url>. Log: <log>`.

`osq server start` with `OSQ_SERVER_ROLE=supervisor` SHALL run
`runServiceSupervisor` with `service: 'server'`. With `OSQ_SERVER_ROLE=worker`
it SHALL run the server worker: `startWebServer` on `serve.server.port` with
`site` `{ name, project }` from "Server configuration" and a `runAction` from
`createWebActionRunner({ cwd, config }, createServerCommands())`, whose table runs
`approve`, `reject` and `retry` as `osq serve` does and runs `land` as
`landCommand(change, { ...inputs, publish: true })`. Every
`serve.server.buildCheckSeconds` the worker SHALL call a
`createServiceBuildCheck` check. On a settled new build, when no action
runs, it SHALL close the server and exit with `EXIT_NEW_BUILD`; while an
action runs, it SHALL wait for it to end first. A waiting build SHALL not stop
the worker. On SIGINT or SIGTERM the worker SHALL close the server after any
running action ends and exit 0.

`landCommand` SHALL take an optional `publish`. With it, the command SHALL
land through `landAndPublish` instead of `landChange`, with the same output,
refusals and exit codes otherwise. No CLI flag sets `publish`.

`osq server stop` SHALL send SIGTERM to a live server supervisor and wait up
to `watch.stopWaitSeconds` for it to exit, printing `osq server stopped (pid
<pid>)` when it exited, `osq server is stopping after its running action (pid
<pid>)` when it did not, and `osq server is not running` when there is no
live record. It SHALL then stop the watch service exactly as `osq watch
--stop` does, printing its line. `osq server` with no subcommand or another
one SHALL print the command's help and exit nonzero, as Commander does.

#### Scenario: Start and stop
- **WHEN** a user runs `osq server start` in a project with no live records, with `serve.server.port` set to a free port and `harness: 'mock'`, and then `osq server stop`
- **THEN** start prints the watch service line and `osq server is running in the background (pid <pid>) at http://127.0.0.1:<port>/p/<project>/. Log: <log>`, `GET <url>api/server` answers 200 with the project and a live watcher, and after stop `server.json` and `service.json` name no live pid

#### Scenario: Already running
- **WHEN** `server.json` names a live pid and the user runs `osq server start`
- **THEN** it fails with `osq server is already running (pid <pid>). Log: <log>. Stop it with osq server stop` and spawns nothing

#### Scenario: Watcher already running
- **WHEN** a terminal watcher's live `watcher.json` exists and the user runs `osq server start`
- **THEN** no watch service is started and the server starts

#### Scenario: Stop with nothing running
- **WHEN** no server and no watch service run and the user runs `osq server stop`
- **THEN** it prints `osq server is not running` and `osq watch is not running in the background`

#### Scenario: Server land publishes
- **WHEN** the server worker's runner runs `land` for change `001`
- **THEN** the land function it was built with is called once for change `001` with `publish: true` and the runner's `cwd` and config
