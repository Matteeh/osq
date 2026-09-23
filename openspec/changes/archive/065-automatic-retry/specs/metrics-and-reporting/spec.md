# Spec Delta: Metrics and Reporting

## ADDED Requirements

### Requirement: Automatic retry history
<!-- source: src/core/report/report-retries.ts, src/core/report/report.ts, src/cli/report.ts, tests/report-retries.test.ts, fixture/report/** -->
From task event streams, `osq report` SHALL count `retry` events split into
automatic and manual, how many of the attempts they opened reached `done`,
the `stuck` events, and the harness-reported cost of those attempts with the
number of attempts that reported one. An attempt opened by a retry SHALL run
from that retry until the next `retry` or the end of the stream.

#### Scenario: Automatic and manual outcomes
- **WHEN** one task has an automatic retry whose attempt reaches done at a cost of 0.10, and another has a manual retry whose attempt dies and then a `stuck` event
- **THEN** `history.retries.automatic` reports count 1, reachedDone 1, cost 0.10, and `history.retries.manual` reports count 1, reachedDone 0, with stuck 1

#### Scenario: No retries
- **WHEN** no stream holds a `retry` event
- **THEN** both groups report zero counts and cost `not reported` in text
