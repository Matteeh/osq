---
planner: null
date: 2026-09-22
---

## Goal

Make a task die for the breakage it caused, at the moment it caused it. Add two gates: run the change-level `verify` after every successful task verify, and freeze every preexisting test file outside the task's resolved scope even when `tests.modify: true`.

## Gate 1: change-level verify after each task

After `runVerificationGate` passes and before `writeDoneMarker`, run the proposal's `verify` with `verifyTimeoutSeconds` when `gates.changeVerifyAfterTask` is enabled. Default the toggle to true. A non-zero or timed-out result kills the task with `change_verify_red`; its dead marker records the command, exit code, timeout state when applicable, and failing output. Record the verify run through the existing change-level event target. A task that breaks a test intended for a later task now dies, so coupled tasks must be merged.

## Gate 2: scope-aware test freeze

Always snapshot `tests/**` before spawning and resolve task scope against the pre-spawn tree. A changed or deleted preexisting test is allowed only when `tests.modify: true` and the resolved scope contains it. Every unauthorized change fails with `undeclared_test_change`, listing the file and literal scope entry that would authorize it. Existing new-test behavior remains unchanged. Add a non-failing lint warning when resolved task scope includes `src/harness/` files but no scope declaration covers `tests/fixtures/events/`; name that folder in the warning.

## Non-goals

- Changing archive-time behavior in `src/watcher/archiver.ts`.
- Changing `verify_red` or `scope_regression` semantics.
- Making the fixture warning an error.
- Changing `PLANNER.md` or its template.

## Tasks

1. When task verification passes, change verification gates completion. Own runner outcome, configuration and doctor integration, and focused runner/config/doctor tests.
2. When an agent edits preexisting tests, scope and tests.modify jointly authorize each file. Extend runner and its focused test after task 1; own watcher verify, linter, and linter tests.

Both task verifiers include their focused tests plus golden events, import graph, and line budget. Change verify is `pnpm verify`. Write watcher-and-harness, cli-foundation, and spec-lint-and-approve capability deltas. Golden fixture files enter a task's scope only if that task changes an event shape.
