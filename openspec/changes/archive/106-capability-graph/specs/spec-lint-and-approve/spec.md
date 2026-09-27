## MODIFIED Requirements

### Requirement: Planned scenarios
<!-- source: src/core/spec/traceability-lint.ts, tests/trace-lint.test.ts -->
A task file MAY hold a `## Scenarios` section with one bullet per scenario its
tests prove, written `- <capability>: <scenario name>`. Lint SHALL treat a
listed scenario as planned when the task's resolved scope holds at least one
test path, existing or not. A test path is one that `isTestPath` accepts, as
the traceability capability's "Test paths" says: under `tests/`, or with
`.test.` or `.spec.` in its file name. A planned scenario that no scenario
test file in any task's resolved scope names yet SHALL count as tested. It
SHALL also count as covering every function tagged with it in that task's
resolved scope. Once a scoped test names the scenario, only real
`scenario(...)` calls count.

#### Scenario: Planned before the test exists
- **WHEN** an opted-in change adds a scenario, and task 2 lists it under `## Scenarios` and scopes the not-yet-written `tests/pricing-bulk.test.ts`
- **THEN** lint reports no untested-scenario finding for it
