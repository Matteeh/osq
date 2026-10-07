---
title: A change verify that fails only outside the task reruns once before the task dies
depends_on: []
verify: pnpm verify
features:
  reads: [spec-lint-and-approve, status-inspection, version-control]
---
## Goal

When a task's own verify passes and the change-level verify then fails only
in tests unrelated to the task, the runner reruns the change-level verify
once before it decides. If the rerun passes, the task is done and a
`change_verify_rerun` event in the task's stream names each test that failed
the first time. `osq report` lists those tests with how often each flaked. A
flaky test then costs one verify run instead of a whole executor attempt, and
osq names it so someone fixes it. Five of the last eight deaths were flaky
tests at change verify (147 task 1, 153 task 2 twice, 154 task 2, 155 task 2).

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
tests check `gates.changeVerifyReruns` and the README bullet; the
failing-test parser on literal outputs; the rerun through `runTask` with a
temporary project, a result-writing adapter, and change-level verify scripts
that print a `✖ failing tests:` section and fail or pass by a counter file;
and the `Flaky tests:` section through `getMetricsReport`, its text
formatter, and the stable JSON on a temporary tree of hand-written streams.

## Non-goals

- Rerunning a task's own verify, the baseline, the focused run, or the
  archive-time verifies.
- Quarantining, retrying inside the test runner, or leaving out flaky tests.
- Reading failing tests from any output but the `node --test` reporters'
  `✖ failing tests:` section. A runner that prints none gets no rerun.
- Showing reruns in `osq show`, the dashboard, or `osq query`.

## Surface

- Added: `gates.changeVerifyReruns` (config key), a non-negative integer defaulting to 1
- Added: `change_verify_rerun` (event type) in task streams, with `rerun`, `tests` and `passed`
- Added: `Flaky tests:` section in `osq report` text and `flakyTests` in its stable JSON
- Changed: README "Gates and permissions", the "Change verification after every task" bullet

## Decisions

- ADR 001: the new gate key is read by the existing jiti-loaded config; no loader is added.
- ADR 002: archive and delta application are untouched; the rerun happens only at a task boundary.
- ADR 004: no validator call is added or moved.
- ADR 005: no validator call is added or moved.
- ADR 008: `osq report` reads the new event through the shared stream reads, so the read index stays derived and holds nothing new of its own.
- ADR 010: the validator is untouched; it still judges once at archive.
- ADR 012: the watch service is untouched; a rerun runs inside the task, so the supervisor still never restarts the worker during it.

## Contract

### Requirement: Change verify rerun after unrelated failures

The runner SHALL rerun a failing change-level verify, up to
`gates.changeVerifyReruns` times, when every failing test it names is a
preexisting, unchanged test under `tests/` that is outside the task's scope
and imports nothing in it. A passing rerun lets the task reach done and a
`change_verify_rerun` event names the tests.

#### Scenario: Unrelated failure passes on rerun
- **WHEN** the change-level verify first fails naming only `tests/other.test.ts`, a preexisting test the agent left unchanged that imports nothing in the task's scope, and passes when run again
- **THEN** the task reaches done, the task's stream holds one `change_verify_rerun` event with `{ rerun: 1, tests: ["tests/other.test.ts"], passed: true }`, and the change stream holds two change-level `verify_ran` events

#### Scenario: No rerun leaves today's behavior
- **WHEN** the runner does not rerun a failing change-level verify
- **THEN** the task dies with `change_verify_red`, the change stream holds one change-level `verify_ran` event for this boundary, and the task's stream holds no `change_verify_rerun` event

### Requirement: Flaky tests in report

`osq report` SHALL count, per test, the passing `change_verify_rerun` events
that name it, and print them under `Flaky tests:`.

#### Scenario: No flakes
- **WHEN** no stream holds a `change_verify_rerun` event with `passed: true`
- **THEN** the report's text and JSON are unchanged

## Human steps

### Before approval

None

### After landing

- Run `pnpm build` so the watcher picks up the rerun; until then it runs the old build.

## Delta

- `specs/watcher-and-harness/spec.md`: adds "Failing test files in verify output" and "Change verify rerun after unrelated failures".
- `specs/cli-foundation/spec.md`: adds "Change verify rerun count".
- `specs/metrics-and-reporting/spec.md`: adds "Flaky tests in report".

No existing requirement is modified. "Zero-trust verification gate" still
holds: a task reaches done only after a change-level run passes, and a red
change-level verify still kills the task when no rerun applies or every
rerun fails.

Three tasks, in order. Task 1 adds the config key and the README bullet.
Task 2 adds the parser, the event type, and the rerun in the runner; it reads
task 1's key. Task 3 adds the report section; it reads task 2's event. No
file is shared between tasks.

## Background

**Why the rule is narrow.** A rerun must never turn a real regression green.
A failing test counts as unrelated only when osq can show the task did not
reach it: osq's own snapshot of `tests/` taken before spawn proves the agent
neither created nor changed it, and the relative import graph that lint
already uses proves it imports nothing the task's scope holds. Anything osq
cannot show, such as a test outside `tests/` or output with no failing-tests
section, gets no rerun. A rerun that still fails kills the task exactly as
today, so the worst case is one extra verify run.

**Where the deaths came from.** `report-reads-once` copying a fixture index
other tests were writing (147, 154), an inbox timing tolerance around a CLI
spawn (153 twice), and a teardown race in `watch-service-build` (155). 156
fixed those three. The 155 death was in the task's own new test, which this
change would still not rerun.
