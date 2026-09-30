---
queue_item: inert-module-cleanup
queue_hash: sha256:00597d479ed6fd3afd9beb4d69f98db5ac9d8a804a74d9a796e2e3e41005ef1a
planner: null
date: 2026-09-30
---

### Goal

No `export {};` stand-in is left in `src/` or `tests/` for a module a change removed.

### Context

As of 2026-09-30, 123 left `src/cli/done.ts`, `src/core/lifecycle/done.ts`, `src/core/status/leftover-drafts.ts`, `tests/done-manual.test.ts`, and `tests/status-leftover.test.ts` as inert modules because the git guard reported deletions as scope violations. `scope-deletions` fixes that.

### Requirements

- Each of those files is deleted, and nothing imports it.
- `VerificationRequirement`, which 125 leaves unused in `src/core/spec/human-steps.ts`, is removed.
- `pnpm verify` passes.

### Non-goals

- Any behaviour change.

### Notes for planning

- Check `tests/line-budget.test.ts` and `tests/function-budget.test.ts` allow lists and any test that names these paths.
