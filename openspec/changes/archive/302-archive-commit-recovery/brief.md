---
queue_item: archive-commit-recovery
queue_hash: sha256:b995c3fd7c7928bbf04441a4197efd6ac5d79b7d93b48517417de4206dd36aae
planner: null
date: 2026-10-22
---

### Goal

When the archive commit in an osq worktree fails, the watcher logs a warning and carries on, leaving the change archived on disk with the move uncommitted. Nothing records the failure, the inbox says `osq land <id>`, and land refuses with a list of uncommitted paths that doesn't say why. A human must then run git by hand, which goes against ADR 003. This happened to 289 on 2026-10-22.

### Context

As of 2026-10-22:

- `commitWorktreeArchive` in `src/watcher/worktree-commit.ts` catches the error from `commitArchive` (`src/core/run/task-commit.ts`) and only calls `logger.warn`. It is called from `archiveCompletedSpec` in `src/watcher/archive-change.ts`.
- Verified tasks already recover from the same failure: `commitPendingVerifiedTasks` commits every done marker the branch lacks on each watcher pass, called from `src/watcher/loop.ts`, and a failed commit returns a `commit_failed` halt.
- Land refuses a dirty worktree in `assertWorktreeClean` in `src/core/vcs/land-checks.ts`.

### Requirements

- When the archive commit fails, the watcher records the failure where the inbox and `osq show` read it, with git's error.
- On a later pass, the watcher makes the missing archive commit for an archived change whose worktree holds the uncommitted move, as it does for pending verified tasks. Success clears the record.
- `osq land <id>` on such a change says the archive commit is missing and what to run, instead of listing paths.
- Tests use scratch repositories with a commit made to fail, for example with a failing pre-commit hook.

### Non-goals

- The Rust archive; `rust-archive-worktree` already fails loudly.
- Finding why git failed for 289.
