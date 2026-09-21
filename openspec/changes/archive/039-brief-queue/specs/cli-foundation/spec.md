# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Brief queue command and configuration
<!-- source: src/cli/queue.ts, src/cli/index.ts, src/core/config.ts, src/index.ts, tests/queue.test.ts, tests/config-queue.test.ts -->
The CLI SHALL provide `osq queue`, reading the queue only from
`openspec/queue.md` and printing every item in file order with its derived
state, associated change, rejection count, unmet dependencies, and section
drift. The command SHALL NOT write the queue file.

Public configuration SHALL accept an optional `queue` block containing both
`maxPlanningSessions` and `maxPlanningCost` as finite non-negative numbers. A
partial or invalid block SHALL be rejected. Configuration SHALL NOT provide a
queue path override.

#### Scenario: Queue command
- **WHEN** a repository contains a valid queue and associated change history
- **THEN** `osq queue` prints its complete deterministic filesystem-derived projection without modifying the queue

#### Scenario: Queue limit configuration
- **WHEN** queue planning limits are configured
- **THEN** both finite non-negative ceilings are available to planning through the public typed configuration

### Requirement: Next queue item planning
<!-- source: src/cli/plan.ts, src/cli/index.ts, src/core/new.ts, src/core/queue.ts, tests/queue-plan.test.ts, tests/queue-watch.test.ts -->
The planning command SHALL accept either ordinary `osq plan <name>` behavior or
`osq plan --next [--replan] [--print]`. Next mode SHALL select exactly the first
unplanned queue item in file order whose queue dependencies are landed, create
one numerically identified folder using the queue slug, seed its proposal title
and numeric archived dependency ids, and write the item body to `brief.md` with
`queue_item` and `queue_hash` metadata before entering the existing planning
flow.

Numeric allocation SHALL consider active, archived, and rejected folders.
Print mode SHALL create the change and emit the prompt without launching a
planner or recording a planning session. The planner context SHALL identify
the selected item and landed dependency archive paths without exposing later
queue items or the complete queue file.

#### Scenario: One eligible item
- **WHEN** `plan --next` finds an unplanned item whose dependencies are landed
- **THEN** exactly one correctly named and seeded change enters the same print or interactive flow as ordinary planning

#### Scenario: No eligible item
- **WHEN** every queue item is active, landed, rejected without replan permission, or waiting on an unlanded dependency
- **THEN** planning explains why nothing is eligible and creates no change

### Requirement: Queue planning safety and spend gates
<!-- source: src/cli/plan.ts, src/core/queue.ts, src/core/config.ts, tests/queue-plan.test.ts, tests/queue-budget.test.ts, tests/queue-watch.test.ts -->
Before mutating state, next-item planning SHALL refuse while any active
queue-associated change has a dead or regressed task or change target, naming
the target and its exact retry command. A rejected first eligible item SHALL
require `--replan`; replanning SHALL preserve all rejected history.

A non-print `plan --next` SHALL require configured queue ceilings. It SHALL
refuse when another session would exceed `maxPlanningSessions`, counting valid
planning starts across active, archived, and rejected queue changes. It SHALL
sum only finite cost from correlated exits and enforce `maxPlanningCost` only
when every counted session has recorded cost. Incomplete cost coverage SHALL
print a note and disable only the cost gate. All refusals SHALL occur before
folder creation, planning-log append, or harness spawn.

#### Scenario: Failed queue change
- **WHEN** an active queue change has an active dead or regressed target
- **THEN** next-item planning refuses before mutation and prints `osq retry <id> <task|change>`

#### Scenario: Rejected queue item
- **WHEN** the first otherwise eligible item has rejected history
- **THEN** next-item planning requires `--replan` and preserves every rejected attempt

#### Scenario: Planning ceiling
- **WHEN** the next session would exceed the session ceiling or complete recorded cost has reached the cost ceiling
- **THEN** next-item planning refuses before mutation

#### Scenario: Incomplete cost coverage
- **WHEN** any counted planning session lacks finite recorded cost
- **THEN** planning prints that the cost ceiling is not enforced while retaining the session gate
