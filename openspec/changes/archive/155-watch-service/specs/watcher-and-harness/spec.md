## ADDED Requirements

### Requirement: Watch state files
osq SHALL keep a project's watcher records under
`<home>/.osq/watch/<sha256 of the project root's real path>/`, the folder
`watchStateDir` in `src/core/run/watch-state.ts` returns. The folder SHALL
hold `service.json`, written by `osq watch --background` for the supervisor;
`watcher.json`, written by a continuous watcher for itself; and `watch.log`,
the service's log. `service.json` SHALL hold `pid`, ISO `startedAt` and
`log`, the log's absolute path. `watcher.json` SHALL hold `pid`, `mode`
(`background` for a service worker, `terminal` otherwise), `version`,
`commit`, ISO `startedAt`, and `waiting`, null or the reason the watcher
waits. `readWatchState` SHALL return each record only when its file parses
and its `pid` is alive, and null otherwise; a process counts as alive when
`process.kill(pid, 0)` succeeds or fails with `EPERM`. `removeWatchRecord`
SHALL delete a record only when its `pid` is the given pid. Nothing in a
change folder or the project tree SHALL be written for these records.

#### Scenario: Live and dead records
- **WHEN** `service.json` names a live pid and `watcher.json` names a pid that is not running
- **THEN** `readWatchState` returns the service record, a null watcher, and the log path

#### Scenario: Record of another process kept
- **WHEN** `removeWatchRecord` runs for `watcher.json` with a pid other than the one the file holds
- **THEN** the file is unchanged

#### Scenario: One folder per project
- **WHEN** two project roots are read with the same home
- **THEN** their state folders differ, and a symlink to a root resolves to that root's folder

### Requirement: Service worker build checks
A watcher started with a `buildCheck` SHALL use it in place of the stale
build checks: before every cycle and at each point where the stale check
runs today, before the step that picks up a pending task and at the top of
the archive step. `createServiceBuildCheck` in `src/watcher/service-build.ts`
SHALL read the build key, the `version` in the package root's
`package.json` and the newest mtime under its `dist/`, once when it is
created, and on each call compare the current key with it:

| Current key | Newest `dist/` file | `src/` newer than `dist/` | Outcome |
|---|---|---|---|
| changed | at least `watch.buildSettleSeconds` old | any | `BuildChangedError` |
| changed | younger | any | wait: `a new osq build is being written` |
| unchanged | any | yes | wait: the stale line |
| unchanged | any | no | pass |

A wait SHALL throw `BuildWaitError` with the reason. A `BuildWaitError` SHALL
skip the rest of that cycle without stopping the loop, spawning a task,
archiving, or writing a marker, commit or event, and the next cycle checks
again. The check SHALL log the reason once each time the reason changes, set
`waiting` in `watcher.json` to it, and set `waiting` back to null on the next
pass. A `BuildChangedError` SHALL stop the loop the way a stale build stops it
today, without printing the stale line, and exit with `EXIT_NEW_BUILD`, 75.
Both errors SHALL extend `StaleBuildError`, so `runWatcherCycle` rethrows
them. A watcher without a `buildCheck` SHALL behave as before.

#### Scenario: Rebuilt while idle
- **WHEN** a watcher with a build check has no pending task, and `dist/` gets a file whose mtime is older than `watch.buildSettleSeconds`
- **THEN** the next cycle exits with 75 and no change folder gains a file

#### Scenario: Build still being written
- **WHEN** `dist/` gets a file with the current time and `watch.buildSettleSeconds` is 10
- **THEN** the watcher spawns no task, does not exit, and `waiting` is `a new osq build is being written`

#### Scenario: Source newer than the build
- **WHEN** a watcher with a build check has a pending task and `src/` is newer than `dist/`
- **THEN** the adapter's spawn is never called, the watcher does not exit, `waiting` holds the stale line, and the line is logged once over three cycles

#### Scenario: Rebuilt during a task
- **WHEN** `dist/` gets a settled newer file while the adapter's spawn for task 1 of a two-task change runs
- **THEN** `.run/done/1` exists, task 2 is never spawned, and the watcher exits with 75

#### Scenario: Wait clears
- **WHEN** a watcher waited on the stale line and `src/` is then no newer than `dist/` as read at start
- **THEN** the next cycle spawns the pending task and `waiting` is null

### Requirement: Watch service supervisor
`runServiceSupervisor` in `src/watcher/service.ts` SHALL run the watcher as a
child process: the same Node executable, its `execArgv`, and the `osq` entry
it was started with, running `watch` with the forwarded flags and
`OSQ_WATCH_ROLE=worker`, its stdout and stderr appended to `watch.log`. Before
each spawn, when `watch.log` is larger than `watch.logMaxBytes`, it SHALL
rename it to `watch.log.1`, replacing any older one. It SHALL append its own
lines to `watch.log` with an ISO timestamp. When the worker exits:

- after a stop request, it SHALL remove `service.json` and exit 0;
- with `EXIT_NEW_BUILD`, it SHALL log `new osq build; restarting the watcher`
  and spawn a new worker at once;
- otherwise, it SHALL log `watcher exited with <code or signal>; restarting
  in <n>s` and spawn a new worker after `n` seconds. `n` starts at
  `watch.restartDelaySeconds` and doubles after each such exit, up to
  `watch.restartMaxDelaySeconds`. It goes back to the start after a worker
  that ran longer than `watch.restartMaxDelaySeconds` or exited with
  `EXIT_NEW_BUILD`.

On SIGTERM or SIGINT it SHALL send SIGINT to a running worker, so the worker
finishes its running task first, and spawn no other worker; with no worker
running it SHALL cancel a pending restart, remove `service.json`, and exit 0.
The supervisor never builds osq and never runs git.

#### Scenario: Crash backoff
- **WHEN** with `restartDelaySeconds` 5 and `restartMaxDelaySeconds` 15, four workers in a row exit with code 1 after one second each
- **THEN** the restarts wait these delays:

| Exit | Delay before the next worker |
|---|---|
| 1 | 5 s |
| 2 | 10 s |
| 3 | 15 s |
| 4 | 15 s |

#### Scenario: Healthy run resets the backoff
- **WHEN** a worker exits with code 1 after running longer than `restartMaxDelaySeconds`, following two quick crashes
- **THEN** the next worker starts after `restartDelaySeconds`

#### Scenario: New build
- **WHEN** a worker exits with 75
- **THEN** a new worker spawns with no delay and the log holds `new osq build; restarting the watcher`

#### Scenario: Stop while a task runs
- **WHEN** the supervisor receives SIGTERM while a worker runs
- **THEN** the worker receives SIGINT, no other worker spawns after it exits, `service.json` is removed, and the supervisor exits 0

#### Scenario: Stop during a restart delay
- **WHEN** the supervisor receives SIGTERM while it waits to restart a crashed worker
- **THEN** no worker spawns, `service.json` is removed, and the supervisor exits 0

#### Scenario: Log rotation
- **WHEN** `watch.log` is larger than `watch.logMaxBytes` before a spawn
- **THEN** its content moves to `watch.log.1` and the new worker writes to a fresh `watch.log`

## MODIFIED Requirements

### Requirement: Stale build preflight detection
The watcher SHALL verify that compiled output is not older than source files
when started from a checkout, and again before each spawn and each archive.
The check SHALL skip a package root without `src/` and a run from TypeScript
source, and SHALL not run at all when `allowStale` or `dev` is set. A check
during a run SHALL compare the newest file mtime under `src/` with the newest
under `dist/` as read when the watcher started, because the running code is
what it loaded then. `findStaleBuild` in `src/watcher/build.ts` SHALL return
the stale line, `osq build is stale: src/ is newer than dist/ in <package
root>. Run 'npm run build' there or pass --allow-stale.`, where `<package
root>` is the absolute package root it compared, or null, without printing or
exiting. `staleBuildMessage(packageRoot)` in the same file SHALL build that
line, and `StaleBuildError` SHALL carry the line it was given as its message.
`checkStaleBuild` SHALL print that line and exit 1 when `findStaleBuild`
returns it. The start check in `startWatcher` SHALL print the line and exit 1
the same way. The pass check SHALL run at the top of the step that picks up a
pending task, before the sync, the scope audit, and the spawn, and at the top
of the archive step, before the worktree checks. When it finds the build
stale, the watcher SHALL write no marker, commit, or event for any change,
SHALL NOT log a `watcher error`, SHALL stop the loop, print the stale line to
stderr, and exit 1, in continuous and in `once` mode. A watcher started with
a `buildCheck`, as a service worker is, follows "Service worker build checks"
instead and never exits on a stale build.

#### Scenario: Stale build detected on checkout without allow-stale
- **WHEN** watcher starts from a checkout and newest file mtime under `src/` exceeds newest mtime under `dist/` without `--allow-stale`
- **THEN** watcher logs a single error line to stderr and exits non-zero

#### Scenario: Stale build bypassed with allow-stale
- **WHEN** watcher starts from a checkout with stale `dist/` and `--allow-stale` is supplied
- **THEN** watcher continues startup into the execution loop

#### Scenario: Source edited while a task runs
- **WHEN** a watcher starts with a fresh build, and the adapter's spawn for task 1 of a one-task change writes a file under `src/` newer than `dist/`
- **THEN** `.run/done/1` exists, the change is not archived, stderr holds the stale line, the exit code is 1, and no `watcher error` is logged

#### Scenario: Stale before the first spawn
- **WHEN** `runWatcherCycle` runs with a stale check that returns the stale line, for a change whose task 1 is pending
- **THEN** it rejects with `StaleBuildError`, the adapter's spawn is never called, and `.run/` gains no file

#### Scenario: Rebuilt without restart
- **WHEN** `src/` gets a newer file during a run, and `dist/` gets a newer file after that, before the next pass
- **THEN** the next pass still finds the build stale, because it compares with `dist/` as read at start

#### Scenario: Allow stale during a run
- **WHEN** a watcher started with `allowStale`, and `src/` gets a newer file while task 1 runs
- **THEN** the change archives and the watcher does not exit

#### Scenario: Stale line names the package root
- **WHEN** `findStaleBuild` runs with a relative package root whose `src/` is newer than its `dist/`
- **THEN** it returns the stale line with that root resolved to an absolute path in place of `<package root>`

#### Scenario: Error carries the found line
- **WHEN** `runWatcherCycle` runs with a stale check that returns a line naming some package root
- **THEN** it rejects with a `StaleBuildError` whose message is exactly that line
