# Spec Delta: Web Inspection

## ADDED Requirements

### Requirement: Unreported web cost
<!-- source: src/core/web/web-data-observations.ts, tests/web-data-unreported.test.ts -->
A change node's execution cost and planning cost, and a task's observed cost,
SHALL be null when no counted attempt or session reported a cost, even if
attempts or sessions exist. Coverage SHALL still report `0 of N`. A partially
reported cost SHALL remain the sum of reported values.

#### Scenario: Sessions without cost
- **WHEN** a change has planning sessions and none reported a cost
- **THEN** its planning cost is null and its coverage is `{ reported: 0, total: N }`

### Requirement: Honest dashboard labels
<!-- source: packages/ui/src/format.ts, packages/ui/src/report/format.ts, packages/ui/src/graph/format.ts, packages/ui/src/change/format.ts, packages/ui/src/change/BriefPanel.tsx, packages/ui/src/report/RepositoryTotals.tsx, tests/ui-change.test.tsx, tests/ui-report.test.tsx -->
The dashboard SHALL format every cost through one shared function. A null
cost, or a cost with zero reported coverage, SHALL read `not reported`. The
brief panel's heading SHALL be `Brief` alone, followed by a plain note when the
change has no brief. The repository totals SHALL show the unmarked count when
it is above zero.

#### Scenario: Unreported cost in the dashboard
- **WHEN** a view renders a null cost or a cost with zero reported coverage
- **THEN** it shows `not reported`, never `$0.0000` or `unavailable`

#### Scenario: Change without a brief
- **WHEN** a change has no brief
- **THEN** the panel heading reads `Brief` and a note under it says the proposal goal is shown instead
