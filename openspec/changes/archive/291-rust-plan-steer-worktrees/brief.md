---
queue_item: rust-plan-steer-worktrees
queue_hash: sha256:1d809a92c32c22aa87f4133bcfb5b528861b5a05db80998727a8903ccc4e6782
planner: null
date: 2026-10-22
---

### Goal

With git on, most changes that need steering sit in an osq worktree or are archived. 278 ported the steering prompt for the checkout with vcs off, so Rust can't steer them.

### Context

As of 2026-10-22:

- TypeScript finds them with `findSteeringChange` and `listArchivedSteering` in `src/core/status/steering-change.ts`. The requirement-changed trigger reads the requirement text from the default branch.
- 278 built the prompt in `crates/features/plan/src/steer*`. The vcs kernel reads files at a revision and lists worktrees.

### Requirements

- With vcs on, Rust `osq plan <id>` writes TypeScript's steering prompt for a change in a worktree and for an archived change, with the requirement text from the default branch.
- Goldens are printed by TypeScript's `dist` from scratch repositories and committed in the change folder.

### Non-goals

- Starting the planner and auto-steer.
