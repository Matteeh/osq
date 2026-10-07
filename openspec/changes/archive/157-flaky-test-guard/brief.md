---
queue_item: flaky-test-guard
queue_hash: sha256:79eb25dbd1b03cd08048a7f8add9ee0d1d82645b897f9fcbc0cd9e7635d41dfd
planner: null
date: 2026-10-07
---

### Goal

When a task's own verify passes and the change-level verify fails only in tests unrelated to the task, osq reruns the change verify once. If the rerun passes, the task is done and osq records which test flaked. A flaky test then costs one verify run instead of a whole executor attempt, and osq names it so someone fixes it.

### Context

As of 2026-10-07 (Notion: "Making osq bulletproof" candidate 2, "Why 153 task 2 died" candidate 2):

- `runChangeVerifyGate` (`src/watcher/change-verify.ts`) runs the proposal's `verify` after each task. A red result kills the task with `change_verify_red` (`src/watcher/failure-reason.ts`); `src/watcher/auto-retry.ts` then respawns the executor.
- `excerptVerifyOutput` (`src/core/run/verify-excerpt.ts`) already finds the `✖ failing tests:` block, which names each failing test file.
- `src/core/spec/import-graph.ts` and `src/core/spec/test-impact.ts` already work out which tests import a task's scope, for lint.
- Five of the last eight deaths were flaky tests at change verify: 147 task 1, 153 task 2 (twice), 154 task 2, 155 task 2.

### Requirements

- When the change verify fails, the task's own verify passed, and no failing test imports a file in the task's scope or was created or changed by the task, osq reruns the change verify once before deciding.
- A passing rerun marks the task done as usual and records an event naming each test that failed the first time.
- A failing rerun, or a failing test that touches the task, kills the task as today.
- `osq report` lists tests that flaked, with how often.
- The number of reruns comes from config, and one rerun is the default.

### Non-goals

- Rerunning a task's own verify.
- Quarantining or skipping flaky tests.

### Notes for planning

- New event types and fields break `tests/golden-events.test.ts`; scope `tests/fixtures/events` and regenerate with `UPDATE_GOLDEN=1`.
- When the failing tests cannot be read from the output, there is no rerun: the task dies as today.
