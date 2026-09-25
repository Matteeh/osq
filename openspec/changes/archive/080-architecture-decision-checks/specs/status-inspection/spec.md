# Spec Delta: Status Inspection

## ADDED Requirements

### Requirement: Dependencies added in show
<!-- source: src/core/status/show.ts, tests/dependencies-report.test.ts -->
`osq show` SHALL print, under each task whose stream holds a
`dependencies_added` event, the line
`      Dependencies added: <name> (<file>), ...` with the distinct pairs from
every such event, sorted by file and then name. Other tasks' output SHALL be
unchanged.

#### Scenario: Task added a package
- **WHEN** task 1's stream holds a `dependencies_added` event adding `zod` to `package.json`
- **THEN** `osq show` prints `      Dependencies added: zod (package.json)` under task 1
