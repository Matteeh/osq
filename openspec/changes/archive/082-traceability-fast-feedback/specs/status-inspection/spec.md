# Spec Delta: Status Inspection

## ADDED Requirements

### Requirement: Focused runs in show
<!-- source: src/core/status/show.ts, tests/focused-show.test.ts -->
`osq show` SHALL print, under each task whose stream holds `focused_ran`
events, the line `      Focused runs: <entry>, <entry>`, with one entry per
event in stream order. An entry is `<outcome> <duration>s`, and a `failed`
entry adds ` (attempt ended, verify skipped)`. The line comes after the
`Scenarios:` line. Other tasks' output SHALL be unchanged.

#### Scenario: Failed then passed
- **WHEN** task 2's stream holds a `focused_ran` with outcome `failed` and duration 0.14, then one with outcome `passed` and duration 0.13
- **THEN** `osq show` prints `      Focused runs: failed 0.14s (attempt ended, verify skipped), passed 0.13s` under task 2
