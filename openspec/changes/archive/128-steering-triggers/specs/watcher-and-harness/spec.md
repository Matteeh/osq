## ADDED Requirements

### Requirement: Watcher leaves a change that needs steering
Each cycle, after the reaper and the automatic-retry step and before a
worktree change's pending commits, archive-spec restore, and clean-tree check,
`runWatcherCycle` SHALL skip a change whose derived state has `steering`, as
the status-inspection requirement "Steering triggers" defines it. For such a
change the cycle SHALL write no marker, event, or commit, SHALL NOT halt it,
spawn a task, or archive it, and SHALL NOT count it as approved and waiting.
The change runs again once its triggers are retired, by approval after
steering or by `osq retry`. Because a second identical death becomes stuck in
the automatic-retry step, that step SHALL still run for the change in the cycle
that marks it stuck.

#### Scenario: Plan edited in the worktree
- **WHEN** task 2 of a change in a worktree died with `blocked`, `tasks/2.md` and `plan-prompt.md` in its worktree folder are edited, and a watcher cycle runs
- **THEN** no `.run/regressed/change.md` exists, the worktree's HEAD is unchanged, and no task spawns

#### Scenario: Stuck after the second death
- **WHEN** a task with `gates.autoRetries` of 1 dies twice with the same output
- **THEN** the cycle after the second death marks it stuck, and later cycles spawn nothing for its change

#### Scenario: Retried trigger runs again
- **WHEN** a human runs `osq retry <id> <n>` for a stuck task and a watcher cycle runs
- **THEN** the task spawns again
