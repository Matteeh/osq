---
queue_item: vcs-root-fails-fast
queue_hash: sha256:b7c9b0516ea9f6026cda2491cfd36ed76f2dcb1ee403d95cc0d95fe343f5d72b
planner: null
date: 2026-10-23
---

### Goal

On 2026-10-22 a Rust approve test ran in a scratch folder under `target/` that was not a repository of its own. Git found the enclosing repository, so the test approved its fixture change `001-alpha-twice` into the real repo, and the watcher ran it. Today both languages fall back to no version control without a word when the project root sits inside a repository but is not its top level. Make that case fail loudly instead, so a misplaced root stops at once and the message says how to fix it.

### Context

As of 2026-10-23:

- TypeScript: `selectVcs` in `src/core/vcs/select.ts` returns `NoVcs(VCS_REASONS.notRoot)` when the real project root differs from git's top level.
- Rust: approve's `git_repo` in `crates/features/approve/src/approve.rs` returns `None` in the same case; other features that write git (reject, run, archive, land, sync) get their root through the vcs kernel without one shared check.
- A project root that is in no repository at all stays as today: no version control.

### Requirements

- With `vcs.enabled` on, every command that reads or writes git fails, writing nothing, when the project root is inside a repository but is not its top level. The message names both paths and says to run osq from the repository root or turn `vcs.enabled` off.
- Rust does it in one vcs kernel function that every feature calls, not one check per feature.
- Tests in both languages run a command from a folder inside a scratch repository and see the refusal and an untouched repository.

### Non-goals

- Doctor checks for orphan `osq/*` branches.
- Changing what happens outside any repository.
