---
queue_item: worktree-remove-not-timed-out
queue_hash: sha256:a331da4048017f1a6381192ccfa6cab6b65d1bbe0a6b33254e10dfd3eaffe731
planner: null
date: 2026-10-24
---

### Goal

When osq removes a change's worktree, the removal finishes or fails cleanly, so a large build folder never leaves a half-deleted worktree that git no longer knows.

### Context

- `GitVcs.worktreeRemove` (`src/core/vcs/git-vcs-write.ts`) runs `git worktree remove` through `ctx.run`, which is bounded by `timeouts.gitSeconds` (10 s by default, set for quick git reads).
- On 2026-10-24 `osq approve 326` merged main into `osq/326`, the merge conflicted, and `restartDefaultBranchBranch` (`src/core/spec/approve-default-branch-restart.ts`) called `worktreeRemove` on a worktree holding a 20 GB `target/`. The removal was killed partway: `.git`, `crates/`, `decisions/` and `scripts/` were gone, while `target/`, `node_modules/` and `src/` stayed. `git worktree list` showed it as prunable.
- The `osq: 326 approved` commit had already landed on the branch, but the `regressed` marker stayed. The next `osq approve 326` failed with `git is off: not a git repository`. Recovery took a manual move-aside, `git worktree prune`, and a watcher restart so `recreateWorktrees` rebuilt the worktree.
- Land's worktree cleanup and any other `worktreeRemove` caller share the same bound.

### Requirements

- `git worktree remove` runs under its own timeout config key, not `timeouts.gitSeconds`, with a default long enough for a multi-gigabyte build folder.
- When the removal fails or times out during a restart, approve stops with a message that names the worktree and the recovery steps: move the folder aside, run `git worktree prune`, and restart `osq watch` so it recreates the worktree. The change's markers stay as they were, so a second `osq approve` can finish the restart.
- A scenario test covers a removal that fails mid-restart: approve stops with that message and leaves the markers unchanged.

### Non-goals

- Making `git worktree remove` faster, for example by deleting `target/` first.
- The Rust vcs kernel, whose land wiring has its own timeouts.
- Recovering a broken worktree inside `osq approve`; the watcher's `recreateWorktrees` already does that on restart.
