## ADDED Requirements

### Requirement: Validation in report
`osq report` SHALL take, for every archived change, the latest
`validator_ran` event in its `.run/events/change.jsonl`, read through the
shared reader by `collectValidation` in
`src/core/report/report-validation.ts`. With at least one such event, the
stable JSON SHALL hold
`validation: { changes, validated, findings, perChange: [{ change, outcome, findings }] }`.
`changes` counts the changes with an event, `validated` those whose outcome
is `validated`, and `findings` the findings of validated changes.
`perChange` lists each change by folder name, in folder name order, with its
outcome and its finding count, 0 unless validated. The text SHALL print a
`Validation:` section after the `Mutation:` section:
`  <validated> of <changes> changes validated, <findings> findings`, then one
line per change, `  <folder>: <n> findings` for a validated change and
`  <folder>: not validated (<outcome>)` for any other. With no
`validator_ran` event, the JSON SHALL have no `validation` key and the text
no section.

#### Scenario: Two validated, one failed
- **WHEN** archived changes 040 and 041 have validated events with 2 and 0 findings and 042 has a `failed` event
- **THEN** the report prints `  2 of 3 changes validated, 2 findings`, `  040-a: 2 findings`, `  041-b: 0 findings`, and `  042-c: not validated (failed)`, and its JSON `validation` holds `changes: 3`, `validated: 2`, and `findings: 2`

#### Scenario: Latest event wins
- **WHEN** one archived change's `change.jsonl` holds a `failed` event and then a validated one with 1 finding
- **THEN** the report counts that change as validated with 1 finding

#### Scenario: No validator events
- **WHEN** no archived change has a `validator_ran` event
- **THEN** the report's text and JSON are unchanged
