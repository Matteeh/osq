# Tasks

## 1. Sync kernel

- [x] 1. When a caller lists conflicted paths, the sync kernel resolves them to the default branch's version and stops only on the others

## 2. Retry

- [x] 2. When a target's stream records a failure after the approval, the Rust retry reaction leaves that target alone

## 3. Approve

- [x] 3. When a human approves a worktree change stopped by the default branch, the Rust approve feature merges the default branch inline through the sync kernel and keeps its done tasks, as TypeScript's merge path does
- [x] 4. When the default branch conflicts with a change a human approves, the Rust approve feature reopens only the tasks from the first owning task on, or stops for planning when no task owns a file

## 4. CLI

- [x] 5. When osq approve runs through the CLI on a change stopped by the default branch, every reaction runs and the change ends as TypeScript leaves it, or with only the owning tasks reopened
