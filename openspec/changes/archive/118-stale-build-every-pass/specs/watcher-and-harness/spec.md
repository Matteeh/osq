## MODIFIED Requirements

### Requirement: Stale build preflight detection
The watcher SHALL verify that compiled output is not older than source files
when started from a checkout, and again before each spawn and each archive.
The check SHALL skip a package root without `src/` and a run from TypeScript
source, and SHALL not run at all when `allowStale` or `dev` is set. A check
during a run SHALL compare the newest file mtime under `src/` with the newest
under `dist/` as read when the watcher started, because the running code is
what it loaded then. `findStaleBuild` in `src/watcher/build.ts` SHALL return
the stale line, `osq build is stale: src/ is newer than dist/. Run 'npm run
build' or pass --allow-stale.`, or null, without printing or exiting.
`checkStaleBuild` SHALL print that line and exit 1 when `findStaleBuild`
returns it. The start check in `startWatcher` SHALL print the line and exit 1
the same way. The pass check SHALL run at the top of the step that picks up a
pending task, before the sync, the scope audit, and the spawn, and at the top
of the archive step, before the worktree checks. When it finds the build
stale, the watcher SHALL write no marker, commit, or event for any change,
SHALL NOT log a `watcher error`, SHALL stop the loop, print the stale line to
stderr, and exit 1, in continuous and in `once` mode.

#### Scenario: Stale build detected on checkout without allow-stale
- **WHEN** watcher starts from a checkout and newest file mtime under `src/` exceeds newest mtime under `dist/` without `--allow-stale`
- **THEN** watcher logs a single error line to stderr and exits non-zero

#### Scenario: Stale build bypassed with allow-stale
- **WHEN** watcher starts from a checkout with stale `dist/` and `--allow-stale` is supplied
- **THEN** watcher continues startup into the execution loop

#### Scenario: Source edited while a task runs
- **WHEN** a watcher starts with a fresh build, and the adapter's spawn for task 1 of a one-task change writes a file under `src/` newer than `dist/`
- **THEN** `.run/done/1.md` exists, the change is not archived, stderr holds the stale line, the exit code is 1, and no `watcher error` is logged

#### Scenario: Stale before the first spawn
- **WHEN** `runWatcherCycle` runs with a stale check that returns the stale line, for a change whose task 1 is pending
- **THEN** it rejects with `StaleBuildError`, the adapter's spawn is never called, and `.run/` gains no file

#### Scenario: Rebuilt without restart
- **WHEN** `src/` gets a newer file during a run, and `dist/` gets a newer file after that, before the next pass
- **THEN** the next pass still finds the build stale, because it compares with `dist/` as read at start

#### Scenario: Allow stale during a run
- **WHEN** a watcher started with `allowStale`, and `src/` gets a newer file while task 1 runs
- **THEN** the change archives and the watcher does not exit
