## MODIFIED Requirements

### Requirement: Running change in status
<!-- source: src/core/status/status.ts, tests/status-worktree.test.ts, tests/worktree-lifecycle.test.ts -->
`osq status` SHALL print `  worktree: <path>` under a change that runs in a
worktree, directly below its heading line. While a task of that change is
running, it SHALL print, below the worktree line,
`  warning: a task is running in this worktree; do not edit it until the task ends`.
When the checkout still holds a
folder of the same name whose authored-content hash differs from the
worktree's `.run/approved`, it SHALL print, below those lines,
`  warning: the checkout's copy of <folder> changed since approval; edits there never reach the run`.
A checkout copy that matches, or is missing, SHALL print no warning.

#### Scenario: Worktree path
- **WHEN** `osq status` runs with `vcs.enabled` and a change approved into a worktree
- **THEN** the change is listed once, as approved, followed by `  worktree: ` and the worktree path

#### Scenario: Edited checkout copy
- **WHEN** a task file in the checkout's copy of that change is edited after approval
- **THEN** status prints the checkout copy warning naming the folder

#### Scenario: Untouched checkout copy
- **WHEN** the checkout's copy is unchanged since approval
- **THEN** status prints no warning

#### Scenario: Task running in the worktree
- **WHEN** a task of a change in a worktree holds a live lock in `.run/running/`
- **THEN** status prints the running-task warning directly below the worktree line, and prints no such warning once the lock is gone
