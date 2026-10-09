## ADDED Requirements

### Requirement: Server state files
The folder `watchStateDir` returns SHALL also hold `server.json`, written by
`osq server start` for the server's supervisor, and `server.log`, the
server's log. `server.json` SHALL hold `pid`, ISO `startedAt`, `log`, the
log's absolute path, and `url`, the server's URL. `readServerRecord`,
exported from `src/core/run/watch-state.ts`, SHALL return the record only when the file
parses and its `pid` is alive, and null otherwise, judged as
`readWatchState` judges its records. `writeServerRecord` SHALL write it as
the other records are written. `removeWatchRecord` and
`removeWatchRecordSync` SHALL accept `server` and delete `server.json` only
when it names the given pid. `readWatchState`'s result SHALL not change.

#### Scenario: Live and dead server records
- **WHEN** `server.json` names a live pid, and later a pid that is not running
- **THEN** `readServerRecord` first returns the record and then null, and `readWatchState` returns the same service and watcher records both times

#### Scenario: Server record of another process kept
- **WHEN** `removeWatchRecord` runs for `server` with a pid other than the one `server.json` holds
- **THEN** the file is unchanged

### Requirement: Server supervisor
`runServiceSupervisor` SHALL take an optional `service`, `watch` or
`server`, defaulting to `watch`. With `watch` it SHALL behave exactly as
"Watch service supervisor" says. With `server` it SHALL behave the same way
with these differences:

| | `watch` | `server` |
|---|---|---|
| Worker arguments after the entry | `watch` and the forwarded flags | `server start` |
| Worker role variable | `OSQ_WATCH_ROLE=worker` | `OSQ_SERVER_ROLE=worker` |
| Log and rotated log | `watch.log`, `watch.log.1` | `server.log`, `server.log.1` |
| Record removed on stop | `service.json` | `server.json` |
| Line on a new build | `new osq build; restarting the watcher` | `new osq build; restarting the server` |
| Line after a crash | `watcher exited with <code or signal>; restarting in <n>s` | `server exited with <code or signal>; restarting in <n>s` |

The restart delays, the log size limit and the stop handling SHALL come
from `config.watch` for both. `SERVER_ROLE_ENV`, `OSQ_SERVER_ROLE`, SHALL be
exported beside `WATCH_ROLE_ENV`. The supervisor never builds osq and never
runs git.

#### Scenario: Server worker spawn
- **WHEN** `runServiceSupervisor` runs with `service: 'server'` and an injected spawn
- **THEN** the worker spec's args end with `server start`, its env holds `OSQ_SERVER_ROLE=worker`, and its log path ends with `server.log`

#### Scenario: Server new build
- **WHEN** a server worker exits with 75
- **THEN** a new worker spawns with no delay and `server.log` holds `new osq build; restarting the server`

#### Scenario: Server stop
- **WHEN** the server supervisor receives SIGTERM while its worker runs
- **THEN** the worker receives SIGINT, no other worker spawns after it exits, `server.json` is removed, and `service.json` is untouched

#### Scenario: Watch service unchanged
- **WHEN** `runServiceSupervisor` runs without `service`
- **THEN** it spawns `watch` with `OSQ_WATCH_ROLE=worker` and writes `watch.log`, as before
