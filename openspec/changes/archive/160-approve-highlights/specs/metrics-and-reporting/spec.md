## MODIFIED Requirements

### Requirement: History query tables
`osq query` SHALL build these tables on every call, from the change files,
reading event streams through the index: of archived changes,
`changes(id, folder, title, archived_on, goal, tasks, attempts, halts,
elapsed_seconds, cost, planner)`, `requirements(change, capability, kind,
requirement, renamed_from)`, `tasks(change, task, title, attempts, done)`,
`dead_attempts(change, task, reason)`, and `disclosures(change, task, section,
text)`; and of archived and rejected changes, `notices(change, notice,
severity, opened, outcome)`. It SHALL store them nowhere.

#### Scenario: One archived change
- **WHEN** the archive holds one change with two tasks, one dead attempt, an added requirement, and a `## Deviated` section
- **THEN** each table holds that change's rows, with `kind` `added`, `section` `deviated`, and the dead attempt's reason

## ADDED Requirements

### Requirement: Notice outcomes
For each archived or rejected change, in folder order, the `notices` table
SHALL hold, with `change` the folder name:

- one row per notice of each `plan_ready` record but the last, with `opened`
  null and `outcome` `planned_again`;
- when the manifest records `notices`, one row per item, with `opened` 1 when
  its id is in `opened`, 0 when it is not, and null when `opened` is null, and
  with `outcome` `rejected` for a rejected change, `halted` for an archived
  change whose `halts` is above zero, and `approved` otherwise;
- when the change is rejected and its manifest records no `notices`, one row
  per notice of its last `plan_ready` record, with `opened` null and `outcome`
  `rejected`.

A change with neither records nor manifest notices SHALL add no row.

#### Scenario: Outcomes by change
- **WHEN** the rows' changes are queried
- **THEN** each change gives exactly the row's notices rows

| change | plan_ready records | manifest notices | halts | rows (notice, opened, outcome) |
| --- | --- | --- | --- | --- |
| archived 001 | two: [rules_path], [assumptions] | items [assumptions], opened [] | 0 | (rules_path, null, planned_again), (assumptions, 0, approved) |
| archived 002 | one: [removed_requirement] | items [removed_requirement], opened ["removed_requirement"] | 2 | (removed_requirement, 1, halted) |
| rejected 003 | one: [package_json] | none | none | (package_json, null, rejected) |
| archived 004 | none | none | 0 | none |
