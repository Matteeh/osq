# Spec Delta: Metrics and Reporting

## MODIFIED Requirements

### Requirement: Task and specification metrics derivation
<!-- source: src/core/report/report.ts, tests/report.test.ts, tests/report-task-states.test.ts, tests/report-now.test.ts, tests/report-unreported.test.ts -->
The system SHALL derive specification metrics and current task state across active and archived changes via `osq report`. Current task state SHALL come only from marker files and SHALL contain total, done, verified, manual, dead, regressed, running, pending, and unmarked counts. Pending SHALL count only tasks in active changes that have no terminal or running marker. A task in an archived change without a done, dead, regressed, or running marker SHALL count as unmarked. Historical terminal events SHALL NOT override current marker state.

#### Scenario: Active and archive state sourcing
- **WHEN** `osq report` is executed
- **THEN** current task state for active and archived changes is derived from marker precedence, while specification totals retain their active and archived classification

#### Scenario: Current and historical failure differ
- **WHEN** a currently done task has an earlier dead event
- **THEN** current state counts it as done and execution history retains the dead event

#### Scenario: Regressed current state
- **WHEN** a task has a regressed marker
- **THEN** current state counts it as regressed rather than dead, running, or pending

#### Scenario: Archived task without markers
- **WHEN** an archived change holds tasks with no marker
- **THEN** current state counts them as unmarked, not pending, and the text report prints an `Unmarked:` line

## ADDED Requirements

### Requirement: Unreported cost labelling
<!-- source: src/core/report/report.ts, tests/report-unreported.test.ts, tests/report-planning.test.ts, tests/report-json.test.ts -->
Every formatted cost in `osq report` text and JSON `formattedTotal` SHALL read
`not reported` when no counted attempt or session reported a cost, instead of a
dollar amount. When at least one did, the formatted value SHALL stay a dollar
amount alongside its coverage. Numeric `total` fields SHALL stay the sum of
reported values.

#### Scenario: Planning without reported cost
- **WHEN** planning sessions exist but none reported a cost
- **THEN** `planning.cost.formattedTotal` and the text report's planning cost read `not reported`

#### Scenario: Execution without reported cost
- **WHEN** attempts exist but none reported a cost, or no attempt exists
- **THEN** `history.cost.formattedTotal` reads `not reported` and the coverage still shows `0 of N`
