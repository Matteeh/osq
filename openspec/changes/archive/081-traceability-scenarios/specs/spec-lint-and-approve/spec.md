# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Scenario outcomes
<!-- source: src/core/spec/delta.ts, tests/scenario-outcomes.test.ts -->
`parseScenario` SHALL give every scenario `outcomes`, in order. Each outcome is
the text after a `- **THEN**` line, or after a `- **AND**` line that follows a
THEN with no WHEN between them. An AND line before any THEN belongs to the WHEN
and is not an outcome. A Markdown table directly under an outcome line, with
only blank lines between, SHALL become that outcome's `rows`. The table may be
indented. Its first row names the columns, and a row of dashes and colons is
skipped. Each later row becomes one object keyed by the trimmed header cells,
with trimmed string values, and a missing cell reads as the empty string. An
outcome without a table has no `rows`. `then` keeps only the THEN lines, as
before.

#### Scenario: AND lines and a table
- **WHEN** a scenario has `- **THEN** the unit price follows this table`, a table with columns quantity and unit price and two rows, then `- **AND** the total is not negative`
- **THEN** `outcomes` holds the THEN text with two rows keyed `quantity` and `unit price`, then the AND text without rows

#### Scenario: AND under WHEN
- **WHEN** a scenario has a WHEN, an AND, then a THEN
- **THEN** `outcomes` holds only the THEN text

### Requirement: Scenario tables accepted
<!-- source: src/core/spec/linter.ts, tests/scenario-outcomes.test.ts -->
`osq lint` SHALL accept a change whose delta puts a table directly under a THEN
or AND line, with no finding about the table. It SHALL also accept one whose
living spec does.

#### Scenario: Sample spec with its table
- **WHEN** a change's delta adds the pricing sample's "Volume pricing" requirement with its table
- **THEN** `osq lint` reports the change valid, and `openspec validate --strict` accepts the merged spec

### Requirement: Planned scenarios
<!-- source: src/core/spec/traceability-lint.ts, tests/trace-lint.test.ts -->
A task file MAY hold a `## Scenarios` section with one bullet per scenario its
tests prove, written `- <capability>: <scenario name>`. Lint SHALL treat a
listed scenario as planned when the task's resolved scope holds at least one
test path, existing or not. A test path is under `tests/`, or has `.test.` or
`.spec.` in its file name. A planned scenario that no scenario test file in any
task's resolved scope names yet SHALL count as tested. It SHALL also count as
covering every function tagged with it in that task's resolved scope. Once a
scoped test names the scenario, only real `scenario(...)` calls count.

#### Scenario: Planned before the test exists
- **WHEN** an opted-in change adds a scenario, and task 2 lists it under `## Scenarios` and scopes the not-yet-written `tests/pricing-bulk.test.ts`
- **THEN** lint reports no untested-scenario finding for it

### Requirement: Traceability links
<!-- source: src/core/spec/traceability-lint.ts, src/core/spec/traceability-links.ts, src/core/spec/linter.ts, tests/trace-lint.test.ts -->
For every capability `traceability.capabilities` opts in, lint SHALL read
scenarios from the effective spec: the living spec with this change's delta
applied through "Effective scenario lookup". It SHALL read tags and scenario
calls from the scenario index. `'all'` opts in every capability with a living
spec or a delta in the change. Each finding SHALL be a warning under
`mode: 'warn'` and an error under `mode: 'require'`, with these messages:

- `<capability>: no test names scenario "<name>"`, on the delta, for each
  scenario an ADDED requirement holds, or a MODIFIED requirement holds with a
  block that differs from the living spec's. It is raised unless a scenario
  test file in some task's resolved scope names the scenario, or the scenario
  is planned.
- `<fn>: names a scenario the <capability> spec doesn't have: "<name>"`, on the
  source file, for a `@scenario` tag in a resolved scope file.
- `<fn>: no test for "<name>" covers it`, on the source file, for a
  `@scenario` tag in a resolved scope file naming an existing scenario that no
  scenario test covering the function names, unless the scenario is planned.
- `<fn>: ADR <n> doesn't exist or isn't accepted` and
  `<fn>: ADR <n> doesn't apply to any capability it serves`, on the source
  file, for an `@adr` tag in a resolved scope file. The capabilities a function
  serves are those of its `@scenario` tags. Without any, they are the
  capabilities whose Code ownership covers its file. An ADR applies when it is
  accepted and its `applies_to` is `all` or names one of them. ADR numbers
  match as `sameAdrNumber` matches them.
- `<capability>: two scenarios named "<name>"`, on the delta, for an opted-in
  capability the change has a delta for.

A tag counts when it names an opted-in capability. An `@adr` tag counts when a
capability the function serves is opted in. Lint SHALL compute all of these in
one module call from `lintChangeFolder`, with the import graph it already has.
With no capability opted in, lint SHALL produce none of them.

#### Scenario: Tag covered by a helper test
- **WHEN** pricing is opted in and the sample's table test covers a new `tierPrice` helper instead of `quote`
- **THEN** lint reports `quote: no test for "Volume discount tiers" covers it` on `src/pricing/quote.ts`

#### Scenario: Not opted in
- **WHEN** the same project leaves pricing out of `traceability.capabilities`
- **THEN** lint reports none of these findings

#### Scenario: Require mode
- **WHEN** `traceability.mode` is `require` and an added pricing scenario is neither named by a scoped test nor planned
- **THEN** lint reports `pricing: no test names scenario "<name>"` as an error and the change is invalid

### Requirement: Unreadable traceability forms
<!-- source: src/core/spec/traceability-lint.ts, tests/trace-lint.test.ts -->
When at least one capability is opted in, lint SHALL report every unreadable
tag and scenario call the index holds in a resolved scope file, as
`<file>:<line>: <reason>`, with the same severity as "Traceability links". An
unreadable call whose capability is a literal that isn't opted in SHALL be
skipped. Nothing tag-like in a scoped file is skipped silently.

#### Scenario: Non-literal scenario name
- **WHEN** pricing is opted in and a scoped test calls `scenario('pricing', NAME, { covers: quote }, ...)`
- **THEN** lint reports a finding naming the file, the line, and that the name isn't a literal

### Requirement: Scenario blast radius
<!-- source: src/core/spec/scenario-impact.ts, tests/trace-impact-lint.test.ts -->
For every capability, opted in or not, lint SHALL find each scenario the change
alters: one in a MODIFIED requirement whose block differs from the living
spec's, or one in a REMOVED requirement. For each such scenario that a scenario
test file anywhere in the repository names, lint SHALL warn
`Scenario "<name>" in <capability> changes; tests naming it: <file>, <file>`.
For each of those tests that no task holds in its resolved scope with
`tests.modify: true`, it SHALL report
`<file> names changed scenario "<name>" but no task scopes it with tests.modify: true`.
That is a warning, except an error under `mode: 'require'` for an opted-in
capability. With no scenario test file in the repository, lint SHALL produce
neither.

#### Scenario: Modified scenario with a frozen test
- **WHEN** a delta changes a THEN of "A percentage code comes off the tiered subtotal" and `tests/pricing-quote.test.ts` names it, but no task scopes that test
- **THEN** lint lists `tests/pricing-quote.test.ts` for the scenario and warns that no task scopes it with `tests.modify: true`

#### Scenario: Test scoped for modification
- **WHEN** task 1 scopes `tests/pricing-quote.test.ts` with `tests.modify: true`
- **THEN** lint lists the test and raises no `tests.modify` finding for it
