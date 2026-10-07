## ADDED Requirements

### Requirement: Flaky tests in report
`osq report` SHALL read every `change_verify_rerun` event with
`passed: true` in the numbered task streams of every active and archived
change, through the report's shared stream reads. A test flaked once for each
such event whose `tests` names it; an event naming a test twice counts it
once, and an event with `passed: false` counts nothing.

The stable JSON SHALL hold `flakyTests: [{ test, count }]`, ordered by count,
highest first, then by test path. The text SHALL print, after the mutation
section and before the validation section, a blank line, `Flaky tests:`, and
one `  <test>: <count>` line per entry in the same order. With no passing
`change_verify_rerun` event, the JSON SHALL have no `flakyTests` key and the
text no section.

#### Scenario: Flakes counted across changes
- **WHEN** change 160 task 1 has a passing rerun event naming `tests/a.test.ts` and `tests/b.test.ts`, change 161 task 2 has one naming `tests/a.test.ts`, and change 161 task 3 has a failing rerun event naming `tests/c.test.ts`
- **THEN** the report holds these entries, in this order

| test | count |
| --- | --- |
| `tests/a.test.ts` | 2 |
| `tests/b.test.ts` | 1 |

#### Scenario: Flaky tests text
- **WHEN** the report holds the two entries above
- **THEN** the text holds `Flaky tests:`, then `  tests/a.test.ts: 2`, then `  tests/b.test.ts: 1`

#### Scenario: No flakes
- **WHEN** no stream holds a `change_verify_rerun` event with `passed: true`
- **THEN** the report's text and JSON are unchanged
