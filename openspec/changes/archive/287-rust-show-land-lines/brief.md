---
queue_item: rust-show-land-lines
queue_hash: sha256:239c0b88cb001aa100b7f7df71f02e44dc1a4f3aed4507b24ace77d4284f2a16
planner: null
date: 2026-10-22
---

### Goal

With git on, `osq show <id>` tells the human whether an archived change has landed and what `osq land` will do. 274 ported show with vcs off only, so Rust prints none of this.

### Context

As of 2026-10-22:

- TypeScript builds the lines in `src/core/status/show-land-model.ts` and `show-land-lines.ts`: `Land: landed`, `Land: git is off`, and the `not landed` variants for a missing branch, an unmoved branch and new commits on the default branch since archive.
- 274 built `crates/features/show`, with sections in their own `section.rs` files. The vcs kernel gives branches, merge bases and commit counts; 264 and 270 read changes from worktrees.

### Requirements

- With vcs on, Rust `osq show <id>` prints TypeScript's land lines, in TypeScript's position, for each case above, and the worktree line for a change in an osq worktree.
- With vcs off, the output is unchanged.
- Tests use scratch repositories with worktrees and compare with TypeScript's text.

### Non-goals

- `--json`.
