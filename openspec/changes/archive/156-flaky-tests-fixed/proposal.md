---
title: The known flaky tests pass under full-suite load
depends_on: []
verify: pnpm verify
features:
  reads: [metrics-and-reporting, status-inspection, cli-foundation, spec-lint-and-approve]
---
## Goal

Three tests fail at random when the whole suite runs, and each has killed a
task whose code was correct: the report fixture copy (147 task 1, 154 task 2),
the inbox elapsed-time check (153 task 2, twice) and the watch-service-build
teardown (155 task 2). Each death cost a full executor rerun. After this
change they pass every time, and each still asserts what it asserted before.

The third one has a source bug behind it. `startWatcher` in
`src/watcher/loop.ts` stops on an abort signal by clearing whatever timers
exist at that moment, but it does not check again after `await
changeTrees(...)`. An abort that lands while the watcher is setting up
still lets it create the chokidar watcher and the poll interval afterwards,
and they run cycles until the process ends. Its promise also resolves after
setup, not after a stop, so a caller cannot wait for the watcher to stop.
`tests/watch-service-build.test.ts` works around that with `delay(50)` after
`controller.abort()` and with `fs.rm` retries in `afterEach`.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
`tests/watcher-abort.test.ts` checks that an aborted watcher stops, starts no
cycle after the abort, and that its promise resolves only once no cycle is
running. `tests/report-reads-once.test.ts`, `tests/inbox.test.ts` and
`tests/watch-service-build.test.ts` keep their assertions with the races
removed.

## Non-goals

- A rerun-on-failure mechanism; that is the `flaky-test-guard` queue item.
- Fixing tests not named here. Found while planning, not fixed:
  `tests/git-background-work.test.ts` also removes its directory with
  `maxRetries: 5`; eight report tests (`report-cost`, `report-coverage`,
  `report-cycle`, `report-failure-breakdown`, `report-file-changes`,
  `report-tokens`, `report-task-states`, `report-planning`) build the read
  index inside the checked-in `fixture/report` (ignored by its own
  `.osq/.gitignore`). That is harmless once no test copies `.osq/`.
- Changing `startWatcher` without a signal. `osq watch` and the service worker
  pass no signal and keep today's behaviour.

## Surface

None

## Decisions

- ADR 012: unchanged. The service worker calls `startWatcher` without a
  signal, so it keeps running until its process exits, and the supervisor
  still restarts it only between passes.
- ADR 002: unaffected; archive applies deltas as before.
- ADR 010: unaffected; the validator still runs once at archive.

**The report test copies without `.osq/`.** `fs.cp`'s `filter` runs before it
stats an entry, so filtering out the fixture's `.osq` directory means the
copy never looks at `index.sqlite-shm` while another test's report holds it.
The test builds its own index in the copy, which is what it measures. Giving
every report test its own copy would touch eight frozen tests to fix one.

**The inbox test bounds the CLI's elapsed time instead of guessing a
tolerance.** The test takes the clock before and after the spawn and
projects the inbox at both, so the CLI's `elapsedSeconds` must lie between
the two projected values. The pid and `startedAt` must match exactly. That
is at least as strict as the old 2-second window and does not depend on how
long the spawn took.

**An aborted watcher resolves once it has stopped.** With a signal,
`startWatcher`'s promise resolves only after the abort, once no cycle is
running, and no cycle, file watcher or poll interval starts after the abort.
Tests can then `await` the watcher instead of sleeping. The cause of 155's
ENOTEMPTY could not be reproduced while planning (24 parallel runs of the
file and three full suites without the retries passed). The abort path is
the only thing in that file that can outlive a test, so the fix removes it
and the teardown loses its retries.

## Contract

### Requirement: Reactive watcher loop and signal handling

The system SHALL watch specifications reactively and respond cleanly to
termination signals. When `startWatcher` is given an abort signal and the
signal fires, it SHALL start no cycle, file watcher or poll interval after
the abort, and the promise it returns SHALL resolve once no cycle is running.

#### Scenario: Abort during setup
- **WHEN** a watcher's abort signal fires after its first cycle and before its file watcher and poll interval exist
- **THEN** neither is created, no further cycle runs, and `startWatcher`'s promise resolves

#### Scenario: Abort during a cycle
- **WHEN** a watcher's abort signal fires while a cycle is running
- **THEN** `startWatcher`'s promise resolves only after that cycle has finished, and no cycle starts after it

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: MODIFIED "Reactive watcher loop and
  signal handling", which keeps its SIGINT scenario and adds the two abort
  scenarios. Task 3 owns it.

No file is shared between tasks.
