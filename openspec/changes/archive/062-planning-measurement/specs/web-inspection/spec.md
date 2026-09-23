# Spec Delta: Web Inspection

## MODIFIED Requirements

### Requirement: Unreported web cost
<!-- source: src/core/web/web-data-observations.ts, tests/web-data-unreported.test.ts, tests/web-planning-cost.test.ts -->
A change node's execution cost and planning cost, and a task's observed cost,
SHALL be null when no counted attempt or session reported a cost, even if
attempts or sessions exist or reported tokens. Planning cost coverage SHALL
count only sessions that reported a cost, out of all sessions. A partially
reported cost SHALL remain the sum of reported values.

#### Scenario: Sessions without cost
- **WHEN** a change has planning sessions and none reported a cost
- **THEN** its planning cost is null and its coverage is `{ reported: 0, total: N }`

#### Scenario: Sessions with tokens but no cost
- **WHEN** a change's planning sessions reported tokens and none reported a cost
- **THEN** its planning cost is null, its coverage is `{ reported: 0, total: N }`, and the dashboard shows `not reported`
