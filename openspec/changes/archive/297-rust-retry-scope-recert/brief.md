---
queue_item: rust-retry-scope-recert
queue_hash: sha256:212bb47406611393c9e81ebc598a71a9484507e2d05c868f7e22806f701fb619
planner: null
date: 2026-10-22
---

### Goal

When a done task's files changed after it finished, TypeScript retry reruns that task's verify without an agent: green rewrites the done marker, red requeues the task. Rust retry (277) refuses a scope regression, so a human needs TypeScript to clear one.

### Context

As of 2026-10-22:

- TypeScript recertifies in `retrySpec` in `src/core/lifecycle/retry.ts` with `refreshRecertifiedDoneMarker` in `src/core/lifecycle/recertify.ts`, and appends a `recertification` event that `readRetryContext` reads.
- 277 and 290 built `crates/features/retry`. `run_verify` in the harnesses kernel runs a verify command with the verify role's environment (268).

### Requirements

- Rust `osq retry <id> <n>` on a scope regression with an automated done marker reruns the task's verify. A pass rewrites the done marker with the new scope hash, and a fail requeues the task, each with TypeScript's files, event and text.
- Tests compare the `.run` tree with what TypeScript's `dist` leaves, for a passing and a failing verify.

### Non-goals

- Stacked changes and worktree changes.
