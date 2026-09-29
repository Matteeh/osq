## ADDED Requirements

### Requirement: Approval commit before any worktree step
While a worktree change folder's `.run/approved` does not exist at the
worktree's HEAD, the watcher SHALL skip that change for the cycle before the
stale-lock reaper and every later step, and write no marker, event, or commit
for it. It SHALL read this from git on every cycle, so the cycle after the
approval commit handles the change as usual. A change outside a worktree, or
a worktree without git, SHALL NOT be checked.

#### Scenario: Seal before commit
- **WHEN** a worktree change's folder, with `.run/approved`, is on disk but its approval commit is missing, and a cycle runs
- **THEN** no task spawns, and the change has no `.run/regressed/change.md` and no new event

#### Scenario: Commit lands
- **WHEN** the change folder is then committed in the worktree and another cycle runs
- **THEN** the pending task spawns
