---
queue_item: rust-vcs-writes
queue_hash: sha256:78dc7c4010376bc9c1a55236e6e4bb92c14a4a8542e766e3c7c4834e0aeac141
planner: null
date: 2026-10-21
---

### Goal

The write half of the `Vcs` port, so land, sync and the run feature can be built on Rust.

### Context

As of 2026-10-21:

- `rust-vcs-reads` gives the `Vcs` trait its read operations and `GitVcs`. TypeScript: `src/core/vcs/git-vcs-write.ts`, `git-vcs-merge.ts`, `git-vcs-land.ts` and the write methods of `vcs.ts`: `stage`, `commit`, `commitTree`, `createBranch`, `renameBranch`, `worktreeAdd`, `worktreeRemove`, `worktreePrune`, `merge`, `mergeAbort` and `fastForward`.
- ADR 003: osq never rewrites history and writes the human's checkout or main only through commands the human runs.

### Requirements

- `GitVcs` gains each write operation above, with the same git arguments, author handling and results (`clean` or `conflict` with the conflicting paths, `done` or `blocked` with the blocking paths) as TypeScript.
- Each is tested on a temporary repository: a clean merge, a conflicting merge and its abort, a blocked fast-forward, and a worktree added, listed and removed.
- No operation rewrites history: no reset, rebase, amend or force.

### Non-goals

- `push` and remotes, land and sync logic, which belong to features.
