---
queue_item: sync-refuses-while-watching
queue_hash: sha256:a47b9e1ef291423a63e819504b418bb7bffc4e2687e9a3fe2f99cfec6d8d3680
planner: null
date: 2026-10-23
---

### Goal

A manual `osq sync 305` on 2026-10-23 was between its merge and its commit when the watcher checked 305's worktree, so the watcher halted a healthy change with `worktree_dirty`. Fail fast instead of adding locks: while a watcher runs for the project, `osq sync` refuses at once and says what to do. With `sync-before-retry` the watcher takes the default branch itself before a retry, so a manual sync is rarely needed.

### Context

As of 2026-10-23:

- `osq sync` (`src/core/vcs/sync-main.ts`) runs `git merge --no-ff --no-commit`, rebuilds, runs `vcs.prepare` and verify, and only then commits. It refuses only while a task of the change runs.
- The watcher's pre-spawn check (`worktreeHalt` in `src/watcher/worktree-run.ts`) halts on any path outside the change folder's `.run/`.
- osq already knows whether a watcher runs: `osq status` prints `Watcher: running ..., pid <n>`.
- `osq approve` hit the same race on 116 and was fixed on its own. Write-up: Notion "Why 305 halted on worktree_dirty during osq sync (2026-10-23)".

### Requirements

- While a live watcher runs for the project, `osq sync <id>` writes nothing and fails with a message naming the watcher's pid and saying that the watcher syncs before the next attempt, or to stop it and run `osq sync <id>` again.
- With no watcher running, `osq sync` works as today.
- A test with a live watcher record sees the refusal and an untouched worktree.

### Non-goals

- Locks on worktrees.
- Other commands; add the same refusal to one only when it causes a halt.
