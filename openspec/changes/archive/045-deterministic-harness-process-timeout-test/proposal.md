---
title: Deterministic harness process timeout test
depends_on: []
verify: >-
  node -e "((cp, paths) => [[paths[0]], [paths[0]], [paths[0]], [paths[1], paths[2]]].forEach((files) => cp.execFileSync(process.execPath, ['--import', 'tsx', '--test', ...files], { stdio: 'inherit' })))(require('node:child_process'), process.argv.slice(1))" tests/harness-process.test.ts tests/import-graph.test.ts tests/line-budget.test.ts
features:
  reads:
    - watcher-and-harness
---
## Goal

Make `tests/harness-process.test.ts` deterministic under a full `pnpm verify`
without changing the behavior of `spawnWithTimeout`.

## Verify

The change verifier invokes `tests/harness-process.test.ts` three times in
sequence through synchronous child processes, stopping at the first non-zero
exit. It then runs `tests/import-graph.test.ts` and
`tests/line-budget.test.ts`. All verification is local and requires no network,
TTY, or model.

## Non-goals

- Changing `spawnWithTimeout`, `DEFAULT_KILL_GRACE_PERIOD_MS`,
  `timeouts.harnessKillGracePeriodMs`, or any other runtime code.
- Measuring or asserting elapsed wall-clock time.
- Modifying any other test case beyond removing the now-unused `mock` import
  required by the focused rewrite.

## Contract

### Requirement: Harness adapters and process execution

The system SHALL decouple agent execution via `HarnessAdapter`
implementations.

#### Scenario: Adapter process spawning
- **WHEN** watcher executes a task
- **THEN** configured adapter spawns agent process, enforces execution timeouts, and routes event stream to normalized harness events

#### Scenario: Kill-grace timeout coverage
- **WHEN** the process timeout test runs a real child that handles `SIGTERM` without terminating
- **THEN** the test asserts that execution timed out and terminated with `SIGKILL`, without asserting wall-clock time

## Human steps

- Review the authored proposal, watcher-and-harness delta, and task body, then
  run `pnpm osq approve 045` yourself. Neither the planner nor the executor
  approves the change.

## Delta

- `specs/watcher-and-harness/spec.md` modifies `Harness adapters and process
  execution` to document signal-based, wall-clock-independent kill-grace test
  coverage.
