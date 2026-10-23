---
queue_item: rust-status-command
queue_hash: sha256:79f65439923f3af8d24329a4317ecd1006d5928cf0a727ef36a48d8c004b40f1
planner: null
date: 2026-10-23
---

### Goal

`osq status` is the overview a human reads most after `osq inbox`, and Rust has no `status` command yet. Port it to the show crate, which already derives each change's status and next step for `osq show`.

### Context

As of 2026-10-24:

- TypeScript: `getStatusOverview` and `formatStatusOverview` in `src/core/status/status.ts`, the watcher line in `src/core/status/watcher-line.ts`. It prints `Active specs:` (per change: title, state, approval, worktree, warnings, `next:`, one line per task), `Archived specs: <n>`, `Rejected specs:` and the `Watcher:` line.
- Rust `crates/features/show` derives status and next step ("Show status and next step") and git state for one change; inbox reads every tree.

### Requirements

- Rust `osq status` prints TypeScript's text byte for byte for checkout and worktree changes, with vcs on and off, including the watcher line from the same watcher and service records.
- It reuses show's derivations rather than copying them.
- Tests compare with TypeScript's `dist` on fixture projects.

### Non-goals

- `--json`, unless TypeScript's `status` has it.
- Stacked changes beyond what `osq show` prints for them today.
