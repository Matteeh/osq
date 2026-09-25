# Spec Delta: Metrics and Reporting

## ADDED Requirements

### Requirement: Mutation in report
<!-- source: src/core/report/report-mutation.ts, src/core/report/report.ts, src/cli/report.ts, tests/mutation-report.test.ts -->
`osq report` SHALL take, across every active and archived change, the latest
measured `mutation_ran` event per `<file>#<function>`, by timestamp. It SHALL
group these by each capability named in the event's `scenarios`, for
opted-in capabilities, in name order. Per capability it SHALL show the killed
and survived sums, the score `killed / (killed + survived)`, and every survivor
of those events. osq records no review of a survivor, so every one listed
counts as not yet reviewed.

The stable JSON SHALL hold
`mutation: [{ capability, killed, survived, score, survivors: [{ file, function, line, column, mutator, replacement }] }]`.
The score is rounded to three decimals, or null when nothing was killed or
survived. The text SHALL print a `Mutation:` section with
`  <capability>: <killed> of <killed + survived> killed (<percent>%), <n> survivors not yet reviewed`,
the percent to one decimal, then
`    survived: <file>:<line>:<column> <mutator> -> <replacement>` lines. With no
measured `mutation_ran` event, the JSON SHALL have no `mutation` key and the
text no section.

#### Scenario: Latest measurement wins
- **WHEN** `quote` was measured with two survivors in change 083 and later with one survivor in change 084
- **THEN** the report's pricing entry counts only the change 084 measurement and lists one survivor

#### Scenario: No mutation events
- **WHEN** no stream holds a measured `mutation_ran` event
- **THEN** the report's text and JSON are unchanged
