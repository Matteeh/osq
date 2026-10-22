---
queue_item: rust-archive-worktree
queue_hash: sha256:b69927bdbf856ac0ce3821d86575a25fb08a53ce6895d56db6b8e592f12332ef
planner: null
date: 2026-10-22
---

### Goal

With git on, TypeScript archives a finished change inside its osq worktree and commits the move on the change's branch, so land can find it. Rust archive (248) works only on a change directly under the checkout's `openspec/changes/`.

### Context

As of 2026-10-22:

- TypeScript archives in `archiveCompletedSpec` in `src/watcher/archive-change.ts` and commits with `commitWorktreeArchive`, `newArchiveName` and `readArchiveNames` in `src/watcher/worktree-commit.ts`.
- 248 built `crates/features/archive`. The vcs kernel lists worktrees and commits; the config kernel reads `vcs` (252).

### Requirements

- With vcs on, Rust `osq archive <id>` finds the change in its osq worktree, archives it there as it does in the checkout, and commits the move on `osq/<folder>` with TypeScript's message and archive name.
- With vcs off, archive behaves as today.
- Tests use scratch repositories and compare the branch and archive folder with what TypeScript's `dist` leaves.

### Non-goals

- Stacked changes, and the archive-time `check:` command.
