---
queue_item: land-removes-worktree-folder
queue_hash: sha256:0581e3cc8c1d4e0f1138f2968cdc9a86c83ee2b90a6fa0df04ccc5007d08d077
planner: null
date: 2026-10-23
---

### Goal

On 2026-10-23 eight landed changes had left about 35 GB under `~/.osq/worktrees`. TypeScript land runs `git worktree remove` without `--force` and, when it fails, prints only `Kept worktree <path>:` and exits 0. When 310 landed, the remove ran under `timeouts.gitSeconds` (10 s) and was cut off while deleting a 12 GB Rust `target/` folder: git lost the worktree's `.git` file, the folder and branch stayed, and the reason line was empty. Land should leave no worktree folder behind, and say loudly when it cannot.

### Context

As of 2026-10-24:

- `cleanupChange` in `src/core/vcs/land.ts` removes the worktree and turns any error into a `Kept worktree` line. `land.ts` is at 249 of its 250-line budget, so the change moves code out rather than growing it.
- The worktree's `.run/logs` (verify and harness logs) are ignored by git and live only in the worktree folder.
- Worktree folders hold ignored build output (`target/`, `dist/`, `node_modules/`) that `git worktree remove` without `--force` refuses to delete.

### Requirements

- Once a change has landed, land moves the worktree's change-folder `.run/logs` into the archived change folder in the checkout, then removes the worktree folder with every ignored file in it, with no git timeout cutting the delete short, and prunes git's worktree record.
- When the folder or the record cannot be removed, land exits non-zero after the land commit with a message that names the path and the cause, including `timed out after <n>s` for a timeout. The land commit stays.
- A worktree that is already gone, or half removed as 310's was, is cleaned up on the next `osq land <id>`.
- Tests use scratch repositories with an ignored build folder and a failing removal.

### Non-goals

- Removing worktrees of changes that have not landed.
- The Rust land feature; `rust-land-remove-worktree` ports this.
