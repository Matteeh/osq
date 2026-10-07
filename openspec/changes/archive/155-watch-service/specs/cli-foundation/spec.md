## ADDED Requirements

### Requirement: Watch service configuration
`defineConfig` SHALL validate an optional `watch` block over these defaults
and put the result on `OsqConfig.watch`:

- `restartDelaySeconds`: 5. The first delay before restarting a crashed watcher.
- `restartMaxDelaySeconds`: 300. The longest restart delay, and the run time after which the delay starts over.
- `buildSettleSeconds`: 10. How old the newest `dist/` file must be before a service worker restarts on it.
- `stopWaitSeconds`: 15. How long `osq watch --stop` waits for the service to exit.
- `logMaxBytes`: 10485760. The size at which `watch.log` is rotated.

Each value SHALL be a finite number greater than zero. A partial block SHALL
keep each missing value's default. Any other value SHALL throw an error that
names the key, such as `watch.restartDelaySeconds must be a finite number
greater than zero`. `src/index.ts` SHALL export the `WatchConfig` type.

#### Scenario: Defaults
- **WHEN** `defineConfig({})` runs
- **THEN** `watch` is `{ restartDelaySeconds: 5, restartMaxDelaySeconds: 300, buildSettleSeconds: 10, stopWaitSeconds: 15, logMaxBytes: 10485760 }`

#### Scenario: Partial block
- **WHEN** `defineConfig({ watch: { buildSettleSeconds: 3 } })` runs
- **THEN** `watch.buildSettleSeconds` is 3 and the other four values are the defaults

#### Scenario: Invalid value
- **WHEN** `watch.restartDelaySeconds` is 0, -1, `Infinity`, or `'5'`
- **THEN** `defineConfig` throws an error naming `watch.restartDelaySeconds`

### Requirement: Background watch commands
`osq watch --background` SHALL start the watch service for the project and
return: it spawns the same Node executable with its `execArgv`, the `osq`
entry it runs from, and `watch` with `--verbose` or `--quiet` when given, as a
detached process with `OSQ_WATCH_ROLE=supervisor`, its stdout and stderr
appended to `watch.log`, writes `service.json`, and prints `osq watch is
running in the background (pid <pid>). Log: <log path>`. `osq watch
--background` with `--once`, `--dev` or `--allow-stale` SHALL fail with
`--background cannot be combined with --once, --dev or --allow-stale`.

`osq watch` with `OSQ_WATCH_ROLE=supervisor` SHALL run
`runServiceSupervisor`, and with `OSQ_WATCH_ROLE=worker` SHALL start the
watcher with `createServiceBuildCheck` as its `buildCheck` and write its
`watcher.json` with mode `background`. A continuous `osq watch` without a
role SHALL write `watcher.json` with mode `terminal`. Each SHALL remove its
own `watcher.json` when it exits. `osq watch --once` SHALL write no record.

`osq watch`, with or without `--background` or `--once`, SHALL fail before it
starts anything when `readWatchState` returns a live record:

| Live record | Message |
|---|---|
| `service.json` | `osq watch is already running in the background (pid <pid>). Log: <log path>. Stop it with osq watch --stop` |
| `watcher.json` only | `osq watch is already running in a terminal (pid <pid>)` |

A supervisor and its own worker are exempt from this check.

`osq watch --stop` SHALL send SIGTERM to the live supervisor and wait up to
`watch.stopWaitSeconds` for it to exit. It SHALL print `osq watch stopped
(pid <pid>)` when it exited, `osq watch is stopping after its running task
(pid <pid>)` when it did not, and `osq watch is not running in the
background` when `service.json` has no live record, exiting 0 in each case.
`--stop` with any other `watch` option SHALL fail with `--stop takes no other
option`.

#### Scenario: Start
- **WHEN** `osq watch --background` runs in a project with no live record
- **THEN** it prints `osq watch is running in the background (pid <pid>). Log: <log path>`, returns while the supervisor keeps running, and `service.json` names that pid

#### Scenario: Already running
- **WHEN** `osq watch --background` or `osq watch` runs while `service.json` names a live pid
- **THEN** it fails with the background message from the table and spawns nothing

#### Scenario: Terminal watcher running
- **WHEN** `osq watch --background` runs while only `watcher.json` names a live pid
- **THEN** it fails with `osq watch is already running in a terminal (pid <pid>)`

#### Scenario: Stop
- **WHEN** `osq watch --stop` runs while the service runs and its worker is idle
- **THEN** it prints `osq watch stopped (pid <pid>)`, and neither `service.json` nor `watcher.json` names a live pid

#### Scenario: Stop waits for the running task
- **WHEN** the supervisor is still alive after `watch.stopWaitSeconds`
- **THEN** `osq watch --stop` prints `osq watch is stopping after its running task (pid <pid>)` and exits 0

#### Scenario: Nothing to stop
- **WHEN** `osq watch --stop` runs with no live `service.json`
- **THEN** it prints `osq watch is not running in the background` and exits 0

#### Scenario: Refused combination
- **WHEN** `osq watch --background --dev` runs
- **THEN** it fails with `--background cannot be combined with --once, --dev or --allow-stale` and spawns nothing
