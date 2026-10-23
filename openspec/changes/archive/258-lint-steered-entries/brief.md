---
queue_item: lint-steered-entries
queue_hash: sha256:231104ba6abbcc42ac863803409c01bbb4d08cb1d51137ea032fa0d87c5d5a9b
planner: null
date: 2026-10-21
---

### Goal

Linting a running change from the main checkout reports its done tasks' `entry` lines that name the change's own delta as missing, because the change folder lives only in the worktree. A human then has to edit done tasks to approve a steering.

### Context

As of 2026-10-21:

- Steering 251 on 2026-10-21: `osq lint 251` from main failed with "Task 1 entry names openspec/changes/251-rust-pi-harness-run/specs/rust-harnesses/spec.md, which is not in main and no task up to this one creates", from `src/core/spec/entry-lint.ts`. Removing those entry lines from done tasks 1 and 2 was the workaround.
- Linting the same change in its worktree instead reports the tests done tasks created as preexisting.

### Requirements

- An `entry` that names a file inside the change's own folder counts as present when that file exists in the change folder being linted, wherever that folder is.
- A test lints a change whose folder exists only in a worktree, from the main checkout, with a task entry naming its own delta.

### Non-goals

- Changing where steered changes are linted from.
