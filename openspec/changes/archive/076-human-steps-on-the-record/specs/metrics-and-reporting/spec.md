# Spec Delta: Metrics and Reporting

## ADDED Requirements

### Requirement: After-landing verification counts
<!-- source: src/core/report/record-verification.ts, src/core/report/report.ts, tests/report-verification.test.ts -->
`osq report` SHALL count archived changes that require verification by their
latest outcome as `passed`, `failed`, and `pending`, print `After-landing
checks: <passed> passed, <failed> failed, <pending> pending` in text, and carry
`history.verification: { passed, failed, pending }` in JSON. When no archived
change requires verification, it SHALL print neither.

#### Scenario: Mixed outcomes
- **WHEN** three archived changes require verification, one passed, one failed, and one without an outcome
- **THEN** the report prints `After-landing checks: 1 passed, 1 failed, 1 pending` and JSON carries the same counts

#### Scenario: No verification required
- **WHEN** no archived `archived` event carries `verification`
- **THEN** the text has no `After-landing checks` line and JSON `history` has no `verification` key
