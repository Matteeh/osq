## ADDED Requirements

### Requirement: Worktree changes wait
<!-- source: src/watcher/loop.ts, tests/change-locations-worktrees.test.ts -->
The watcher cycle SHALL skip every change the resolver reports from a worktree
tree: it SHALL NOT reap, retry, spawn, verify, or archive it. Changes in the
project root SHALL run as before.

#### Scenario: Approved change in a worktree
- **WHEN** a watcher cycle runs with `vcs.enabled` and an approved change whose worktree holds an unstarted task
- **THEN** the cycle runs no task, and the worktree's `.run/` gains no file
