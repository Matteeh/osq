# Spec Delta: Metrics and Reporting

## ADDED Requirements

### Requirement: ADR check flag outcomes
<!-- source: src/core/report/approval-flags.ts, tests/report-approval-flags.test.ts, fixture/report/** -->
`osq report` SHALL report `adr_check_modified` in `approvalFlags.byFlag` after
`adr_departure` and before `none`, counting fired and troubled changes by
handling mode exactly as it does the other flag ids.

#### Scenario: Check flag counted
- **WHEN** one change recorded `adr_check_modified` shown and never had trouble
- **THEN** `approvalFlags.byFlag.adr_check_modified` reports shown fired 1 and troubled 0

### Requirement: Dependencies added per change
<!-- source: src/core/report/report-dependencies.ts, src/core/report/report.ts, src/cli/report.ts, tests/dependencies-report.test.ts -->
`osq report` SHALL list, under `history.dependencies`, each active or archived
change whose task streams hold a `dependencies_added` event, in change order,
with the distinct `{ file, name }` pairs from every such event of every
attempt, sorted by file and then name. Stable JSON SHALL omit the field when
the list is empty. Text output SHALL print a `Dependencies added:` section with
one line per change, `  <change>: <name> (<file>), ...`, only when the list
isn't empty.

#### Scenario: Two changes add packages
- **WHEN** change 012 added `zod` to `package.json` and change 013 added nothing
- **THEN** `history.dependencies` lists only 012 with `zod` in `package.json`, and text prints `  012-<slug>: zod (package.json)`

#### Scenario: No additions
- **WHEN** no stream holds a `dependencies_added` event
- **THEN** stable JSON has no `dependencies` field and text prints no `Dependencies added:` section
