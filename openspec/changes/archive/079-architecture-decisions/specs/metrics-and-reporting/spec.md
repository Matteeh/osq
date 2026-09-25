# Spec Delta: Metrics and Reporting

## ADDED Requirements

### Requirement: ADR departure flag outcomes
<!-- source: src/core/report/approval-flags.ts, tests/report-approval-flags.test.ts, fixture/report/** -->
`osq report` SHALL report `adr_departure` in `approvalFlags.byFlag` after
`verify_starts_conflict` and before `none`, counting fired and troubled
changes by handling mode exactly as it does the other flag ids.

#### Scenario: Departure counted
- **WHEN** one change recorded `adr_departure` shown and later has a `dead` event
- **THEN** `approvalFlags.byFlag.adr_departure` reports shown fired 1 and troubled 1
