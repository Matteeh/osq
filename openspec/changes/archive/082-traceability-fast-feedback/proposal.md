---
title: Run a task's scenario tests before its full verify
depends_on:
  - "081"
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - watcher-and-harness
    - metrics-and-reporting
    - status-inspection
    - traceability
---
## Goal

A broken attempt fails in about the time its own tests take, not the time of
the whole suite. When a task's scoped tests name opted-in scenarios and
`traceability.focusedTests` is set, the watcher first runs only the test files
that name those scenarios. A failing scenario test ends the attempt as a verify
failure. Anything else goes on to the full verify, which still alone decides
whether a task is done, so "verified" gets no weaker.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests on temporary
projects prove that:

- with `traceability.focusedTests` unset, a task runs exactly as today, with no
  focused event
- a task whose scoped tests name two scenarios runs the focused command with the
  files that name them, then the full verify on a pass
- a `not ok` line for a collected scenario ends the attempt as `verify_red`
  without running the full verify, and the output reaches the next attempt
- a focused command that exits nonzero without a failing scenario test is
  recorded as a problem, and the full verify still runs
- a task with no scenario tests in scope skips the focused run
- the focused run gets `OSQ_CHANGE`
- a real `node --test --test-reporter=tap` run of the pricing fixture, with a
  tier boundary broken, ends on its focused run

## Non-goals

- Skipping the full verify when the focused run passes.
- Choosing tests by coverage or through the import graph. The scenario index is
  the only source.
- Reading output from test reporters other than `node:test`'s TAP.
- Focused runs before the first attempt, for the change-level verify, at
  archive, or in scope audits. Only a task's post-exit verify has one.

## Surface

- Added: `traceability.focusedTests` in `osq.config.ts`, a command with a
  `{files}` placeholder (config key)
- Added: the `focused_ran` event, with the focused run's command, files,
  scenarios, outcome, exit code, duration, and output (event type)
- Added: `focused: true` in the frontmatter of a `verify_red` dead marker whose
  attempt ended on its focused run (dead marker field)
- Added: the `Focused runs:` line per task in `osq show` (command output)

## Decisions

- ADR 001: `focusedTests` loads through the existing jiti config path.
- ADR 002: archive is unchanged. It never runs a focused command.
- ADR 004: the change adds no validator call.
- ADR 005: no version check moves.

## Background

Change 081 gives the scenario index in `src/core/trace/scenario-index.ts`, built
from an `ImportGraph`. It records every `scenario(...)` call in a file that
imports `@matteeh/osq/testing`, and can list the test files naming a scenario.
It also gives `traceability` config in
`src/core/foundation/config-traceability.ts`, and sets `OSQ_CHANGE` in
`runVerificationCommand` in `src/core/run/verification.ts`. Every scenario test
is titled `Scenario: <name>`.

On Node 24.21, `node --test --test-reporter=tap` prints each failing test as
`not ok <n> - <title>`, indented when nested, with `#` in a title escaped as
`\#`. A file that fails to load reports under its path, not a `Scenario:` title,
so it counts as a problem, not a failure.

The brief asks to keep the focused run in `verification.ts` so every verify
path gets it. Only a task's post-exit verify should get it, though. A pre-spawn
verify is expected to fail, and the change-level and archive verifies decide
completion. So the run lives in its own `src/core/run/focused-tests.ts`, and
spawns through `runVerificationCommand` so it gets `OSQ_CHANGE` and the same
environment as every verify. The watcher calls it from `checkBlockedFirst` in
`src/watcher/task-verify.ts`, the post-exit chain that already runs just before
the verify. `src/watcher/runner.ts` is 199 lines, and
`tests/import-graph.test.ts` keeps it under 200, so the runner gains no line.

A focused failure reuses `verify_red` through `verifyRedFailure`'s marker shape.
The dead marker body is what the next attempt's prompt carries, and
`verify_red` is already eligible for an automatic retry.

## Contract

### Requirement: Focused failure ends the attempt
When a focused run prints a `not ok` line for a test titled
`Scenario: <name>` naming a collected scenario, the watcher SHALL kill the task
with `verify_red` without running its verify.

#### Scenario: Boundary broken
- **WHEN** a task's scoped test names "Volume discount tiers" and the code's boundary moved so that scenario test fails
- **THEN** the task dies with `verify_red` and `focused: true`, and no `verify_ran` event follows the `focused_ran` event

## Human steps

### Before approval

None

### After landing

- On the pilot project, opt the calculation capability in, set
  `traceability.focusedTests` to `node --test --test-reporter=tap {files}`, and
  time one deliberately failing attempt with and without it. Compare the
  `focused_ran` and `verify_ran` durations in `osq show`. Run
  `osq verified 082 --passed` if failed attempts get noticeably faster, and
  `--failed` if they don't.

## Delta

- `specs/cli-foundation/spec.md`: adds "Focused test command".
- `specs/watcher-and-harness/spec.md`: adds "Focused file collection",
  "Focused run", and "Focused failure ends the attempt".
- `specs/status-inspection/spec.md`: adds "Focused runs in show".

Four tasks, and no file is shared. Task 1 owns the config that task 2 reads.
Task 2 owns `src/core/run/focused-tests.ts`, which task 3 calls. Task 3 owns
the `focused_ran` event type that task 4 reads.
