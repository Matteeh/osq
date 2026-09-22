# Spec Delta: CLI Foundation

## MODIFIED Requirements

### Requirement: Interactive planning command
<!-- source: src/cli/plan.ts, src/cli/index.ts, src/core/report.ts, tests/plan.test.ts -->
The CLI SHALL provide `osq plan <name> [--brief <file> | -] [-print]` to
initialize changes, record briefs, and launch interactive planner sessions.

Every opening prompt SHALL contain five ordered sections: the complete
`PLANNER.md`, change id and title, capability spec paths, the complete brief,
and `This repository's record`. The fifth section SHALL use the shared report
derivation over the 20 most recent archived changes and contain only
first-attempt pass rate, at most ten dead-event lines as change, task title, and
reason, the largest first-attempt pass with scope-file and acceptance-line
sizes, and median task duration.

When fewer than five tasks in that archive window have valid start measures,
the fifth section SHALL contain exactly `This repository's measured record is
too small (fewer than 5 tasks).` after its heading and contain no partial
record. Ordinary new, resumed, queue-selected, interactive, and print planning
paths SHALL use the same prompt bytes.

#### Scenario: New change interactive planning session
- **WHEN** user executes `osq plan <name>` with at least five recently archived measured tasks
- **THEN** system creates the change and brief, builds the five ordered prompt sections with the bounded repository record after the brief, and spawns an interactive session

#### Scenario: Resuming existing change planning session
- **WHEN** user executes `osq plan <id>` on an existing change folder with `brief.md`
- **THEN** system skips folder creation and launches a fresh interactive session with the same five-section prompt contract

#### Scenario: Small repository record
- **WHEN** fewer than five measured tasks exist in the recent archive window
- **THEN** the fifth section contains only the record-too-small explanation after its heading

#### Scenario: Print mode outputs prompt to stdout
- **WHEN** user executes `osq plan <name> -print`
- **THEN** the same five-section opening prompt is written exclusively to stdout without launching an interactive process or recording planning telemetry
