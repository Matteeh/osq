# Spec Delta: Status Inspection

## ADDED Requirements

### Requirement: Scenarios in show
<!-- source: src/core/status/show.ts, tests/trace-report.test.ts -->
`osq show` SHALL print, under each task whose resolved scope holds scenario test
files naming scenarios, the line
`      Scenarios: <capability>: <name>; <capability>: <name>`, with the distinct
pairs sorted by capability and then name. It comes after the
`Dependencies added:` line. Other tasks' output SHALL be unchanged.

#### Scenario: Task with a scenario test
- **WHEN** task 1's scope holds `tests/pricing-quote.test.ts`, which names both pricing scenarios
- **THEN** `osq show` prints `      Scenarios: pricing: A percentage code comes off the tiered subtotal; pricing: Volume discount tiers` under task 1
