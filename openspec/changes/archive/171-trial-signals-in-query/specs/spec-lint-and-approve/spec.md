# Spec Delta: spec-lint-and-approve

## ADDED Requirements

### Requirement: Traceability findings in plan ready records
`lintChangeFolder` SHALL return the findings its traceability check added to
the change's own findings, in order, as the result's optional `traceability`
list. They SHALL stay in `findings` too, and the text and `--json` output of
`osq lint` SHALL not change.

When `osq lint` appends a `plan_ready` record and that list is not empty, the
record's data SHALL also hold
`"traceability":[{"severity":"<severity>","file":"<file>","message":"<message>"}]`,
one entry per finding in order. With an empty or missing list, the record
SHALL have no `traceability` key. `readPlanReady` SHALL return a record's
`traceability` entries when the key is present, leaving out any entry
that does not have string `severity`, `file` and `message`, and SHALL return a record
without the key unchanged, with no `traceability` property.

#### Scenario: Link findings recorded
- **WHEN** `osq lint 001` passes on an unapproved change in a project whose config opts `widgets` into traceability in `warn` mode, and the change's `widgets` delta adds the scenario `Count`, which no task lists and no test names
- **THEN** the appended `plan_ready` record's data holds `traceability` `[{ "severity": "warning", "file": "openspec/changes/001-count/specs/widgets/spec.md", "message": "widgets: no test names scenario \"Count\"" }]`, and `osq lint 001 --json` prints the same document it printed before this change

#### Scenario: No link findings
- **WHEN** `osq lint 001` passes on an unapproved change in a project with no traceability capability opted in
- **THEN** the appended `plan_ready` record's data has exactly the keys `hash` and `notices`

#### Scenario: Reading traceability entries
- **WHEN** `readPlanReady` reads a record whose `traceability` holds one valid entry and one entry without `message`, and a record without `traceability`
- **THEN** the first record's `traceability` holds only the valid entry, and the second record has no `traceability` property
