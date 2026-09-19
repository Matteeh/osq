# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Marker retention under run directory
<!-- source: src/watcher/runner.ts, tests/dead-marker-retention.test.ts -->
The task runner and watcher loop SHALL NOT delete any marker under `.run/` upon successful task completion or rerun. Prior diagnostic markers remain intact.

#### Scenario: Successful task run leaves prior dead markers untouched
- **WHEN** a task with an existing `.run/dead/<n>.<attempt>.md` marker completes successfully
- **THEN** runner writes `.run/done/<n>` without removing the historical dead marker

### Requirement: Manual task completion lifecycle event
<!-- source: src/harness/types.ts, src/core/done.ts, tests/done-manual.test.ts -->
The harness event stream SHALL support a typed `done_manual` event recording human task completion with justification.

#### Scenario: Typed done_manual event emission
- **WHEN** a task is marked done manually
- **THEN** system appends an event to `.run/events/<n>.jsonl` with `type: "done_manual"` and payload containing `task` and `reason`
