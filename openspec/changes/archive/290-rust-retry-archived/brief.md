---
queue_item: rust-retry-archived
queue_hash: sha256:6f16d7186bb0a15e4c58e34bd17796b492735beb6810852d4e5cfad1d3706762
planner: null
date: 2026-10-22
---

### Goal

A change can fail after it archives: its land stops, or a task of the archived change needs another run. TypeScript retries both, and Rust retry (277) handles only active changes in the checkout.

### Context

As of 2026-10-22:

- TypeScript finds the change with `findRetryChange` and commits the retry with `commitArchivedRetry` in `src/core/lifecycle/retry-archived.ts`. cli-foundation's scenarios "Retrying a land stop on an archived change" and "Retrying a task of an archived change" pin the behaviour.
- 277 built `crates/features/retry`, comparing the `.run` tree with TypeScript's. The vcs kernel commits, and 264 and 270 read archived changes from worktrees.

### Requirements

- Rust `osq retry <id> <n>` and `osq retry <id> change` on an archived change make TypeScript's file, event and commit changes, and refuse what TypeScript refuses, with its text.
- Tests use scratch repositories and compare with TypeScript's `dist`.

### Non-goals

- Recertifying a `scope_regression` by scope hash.
- Stacked changes and the plan-edits check.
