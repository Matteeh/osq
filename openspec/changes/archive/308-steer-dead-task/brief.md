---
planner: null
date: 2026-10-23
---

## Goal

A human can steer an approved change in its worktree after any task death, not only after a steering trigger.

## Context

As of 2026-10-23:

- 301 task 3 died with `undeclared_test_change` because its task file lacks `tests.modify: true`, then with a plain `timeout`. Neither is a steering trigger, so `osq plan 301` refuses with "is approved and needs no steering".
- Editing the task file in the worktree does not help: `osq retry` refuses because the folder no longer matches its approved hash, and `osq approve 301` takes "Approval into a worktree" and fails with `branch osq/301-rust-run-worktree already exists`.
- So a plan mistake that a plain retry repeats can only be fixed by letting the task die until the watcher marks it stuck.
- Steering triggers come from `deriveSteering` in `src/core/status/steering.ts` and drive the watcher, the inbox, land and auto-steer. Adding dead tasks there would stop automatic retries, so this change must not.

## Requirements

- `osq plan <id>` on an approved change in an osq worktree with no steering trigger and at least one dead task (no done marker) opens steering for those dead tasks, with each as a `### task <n> dead (<reason>)` trigger in the `## Steering` section.
- `osq approve <id>` on such a change approves the revised plan where it runs, through `approveSteeredChange`, and retires each dead task as `osq retry` does.
- With no dead task, both keep today's refusals.

## Non-goals

- The watcher, inbox, land and auto-steer keep using `deriveSteering` unchanged.
- `osq plan <id> --run` and the dashboard's Start planning button.
- The Rust plan and approve features; a later queue item ports this.
