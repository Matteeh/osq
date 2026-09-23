# Spec Delta: Metrics and Reporting

## ADDED Requirements

### Requirement: Approval flag outcomes
<!-- source: src/core/report/approval-flags.ts, src/core/report/report.ts, src/cli/report.ts, tests/report-approval-flags.test.ts, fixture/report/** -->
`osq report` SHALL read `approvalFlags` from each active and archived change's
manifest and report, per flag id and for changes with no flag, how many changes
recorded it and how many of those later had trouble, split by `shown` and
`confirmed`. Trouble SHALL mean a `dead` event in a task stream or a `regressed`
event in a task or change stream. Changes without a recorded `approvalFlags`
SHALL NOT be counted, and flags SHALL NOT be recomputed.

#### Scenario: Flag outcomes
- **WHEN** three changes recorded `shared_file`, two shown and one confirmed, and one shown change later has a `dead` event
- **THEN** `approvalFlags.byFlag.shared_file` reports shown fired 2 and troubled 1, and confirmed fired 1 and troubled 0

#### Scenario: Older changes
- **WHEN** a change's manifest has no `approvalFlags`
- **THEN** it contributes nothing to the section and `approvalFlags.changes` does not count it
