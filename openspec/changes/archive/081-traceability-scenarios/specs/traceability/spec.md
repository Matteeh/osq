# Spec Delta: Traceability

## Purpose

Links each test to the spec scenario it proves and each exported function to the
scenario it serves and the ADR it follows, through a test helper osq ships, doc
comment tags, and a scenario index built from the source tree.

## ADDED Requirements

### Requirement: Code ownership
<!-- source: src/testing/**, src/core/trace/**, tests/trace*.test.ts, fixture/trace/** -->
The Traceability capability SHALL own the scenario test helper, effective
scenario lookup, the tag and scenario call scanner, the scenario index, their
tests, and their fixtures.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for the test helper, scenario lookup, or scanner files
- **THEN** system maps `src/testing/**`, `src/core/trace/**`, `tests/trace*.test.ts`, and `fixture/trace/**` to traceability

### Requirement: Effective scenario lookup
<!-- source: src/core/trace/scenario-lookup.ts, tests/trace-scenario-lookup.test.ts -->
osq SHALL look up a scenario by capability and exact name and return its
outcomes as parsed by "Scenario outcomes", or fail with one message.

When `OSQ_CHANGE` holds a change folder `<root>/changes/<id>`, the openspec root
SHALL be `<root>`. The effective spec SHALL be the living spec
`<root>/specs/<capability>/spec.md`, merged with `mergeDelta` with the change's
`specs/<capability>/spec.md` when that delta exists. A scenario the change
removes is not found.

Without `OSQ_CHANGE`, the openspec root SHALL be `openspec/` in the nearest
ancestor of the working directory, the working directory included, that holds
`openspec/specs`. The places that define a scenario SHALL be the living spec
and each ADDED or MODIFIED requirement of each active change's delta for that
capability, in change folder order. When two places define it with different
outcomes, the lookup SHALL fail with
`The <capability> scenario "<name>" differs between <place> and <place>; set OSQ_CHANGE to the change folder the test should prove`,
where each place is a spec path relative to the folder that holds the openspec
root.

When the effective spec, or without `OSQ_CHANGE` any one place, holds two
scenarios with the same name, every lookup in that capability SHALL fail with
`The <capability> spec has two scenarios named "<name>"`, naming the first
duplicate in document order. A scenario found nowhere SHALL fail with
`The <capability> spec has no scenario "<name>"`. That includes a capability
with no spec. A delta that `mergeDelta` refuses SHALL fail with the refusal's
message.

Each capability's spec SHALL be read and parsed once per process for each
openspec root and `OSQ_CHANGE` value. Every lookup SHALL take the working
directory and environment as arguments, so a caller never reads
`process.env` through it by accident.

#### Scenario: Scenario only in the change
- **WHEN** `OSQ_CHANGE` names a change whose delta adds the scenario "Bulk tier" to pricing
- **THEN** the lookup returns the delta's outcomes for "Bulk tier"

#### Scenario: Modified scenario uses the delta
- **WHEN** `OSQ_CHANGE` names a change whose MODIFIED requirement changes "the total is 1620.00" to "the total is 1600.00"
- **THEN** the lookup returns "the total is 1600.00"

#### Scenario: Removed scenario
- **WHEN** `OSQ_CHANGE` names a change whose delta removes the requirement holding the scenario
- **THEN** the lookup fails with `The pricing spec has no scenario "<name>"`

#### Scenario: Places disagree
- **WHEN** `OSQ_CHANGE` is unset and an active change modifies a scenario's outcomes
- **THEN** the lookup fails naming the living spec path, the change's delta path, and `OSQ_CHANGE`

#### Scenario: Active change adds a scenario
- **WHEN** `OSQ_CHANGE` is unset and only an active change's delta defines the scenario
- **THEN** the lookup returns that delta's outcomes

### Requirement: Scenario helper
<!-- source: src/testing/scenario.ts, src/testing/index.ts, tests/trace-helper.test.ts -->
`scenario(capability, name, { covers }, body)` SHALL register one `node:test`
test titled `Scenario: <name>`. When the test runs, the helper SHALL look up
the scenario with "Effective scenario lookup", using `process.cwd()` and
`process.env`. It SHALL then call `body` with three functions and await what
`body` returns:

- `run(...args)` calls `covers` with those arguments and returns its result.
- `then(outcome, check)` asserts one outcome without a table.
- `each(outcome, check)` calls `check` once per row of the outcome's table, in
  order, with the row as an object keyed by the header cells.

An outcome is named by its exact text. The test SHALL pass only when `covers`
ran at least once through `run`, every outcome was asserted by a `then` or
`each` that completed, and no check failed.

#### Scenario: Every outcome asserted
- **WHEN** the pricing sample's test runs `quote` through `run` and asserts the subtotal, discount, and total with `then`
- **THEN** the test passes

#### Scenario: Every row checked
- **WHEN** the table test checks each row of "the unit price follows this table" with `each`
- **THEN** `check` runs once per table row and the test passes

### Requirement: Scenario helper failures
<!-- source: src/testing/scenario.ts, tests/trace-helper.test.ts, tests/trace-pricing.test.ts -->
The helper SHALL fail the test with an error whose message is exactly one of
these. `<fn>` is the covered function's `name`, or `the covered function` when
that is empty.

- a lookup failure from "Effective scenario lookup", unchanged
- `"<text>" is not a THEN of this scenario`, when `then` or `each` names text that isn't an outcome
- `THEN <text>: has a table, so check it with each`, when `then` names an outcome with a table
- `THEN <text>: has no table`, when `each` names an outcome without one
- `THEN <text>: failed`, with the thrown value as `cause`, when a `then` check throws or rejects
- `THEN <text>: failed at <column> <value>, <column> <value>`, with the thrown value as `cause`, when an `each` check throws or rejects for a row, listing that row's columns in header order
- `THEN <text>: checked before <fn> ran`, when a check completes and no call through `run` has started
- `THEN <text>: checked before <fn> settled`, when a check completes and every call through `run` so far returned a promise that hasn't settled
- `<fn> never ran`, when `body` finishes without any call through `run`
- `No assertion for: <text>; <text>`, when `body` finishes and outcomes remain unasserted, listed in spec order

The checks after `body` SHALL run in the order listed, `never ran` first. Every
message about one outcome SHALL start with `THEN `, and only a failing check
produces `: failed`. A tool can then tell a THEN failure from a missing
scenario or a load error.

#### Scenario: Deleted then
- **WHEN** the percentage-code test drops its `then` for "the total is 1620.00"
- **THEN** it fails with `No assertion for: the total is 1620.00`

#### Scenario: Number changed in the spec
- **WHEN** the spec changes "the total is 1620.00" to "the total is 1600.00" and the test is unchanged
- **THEN** it fails with `"the total is 1620.00" is not a THEN of this scenario`

#### Scenario: Function called directly
- **WHEN** the test calls `quote` directly instead of through `run`
- **THEN** it fails with `THEN the subtotal is 1800.00: checked before quote ran`

#### Scenario: Boundary moved in the code
- **WHEN** the code's tier test changes from `>= 100` to `> 100`
- **THEN** the table test fails with `THEN the unit price follows this table: failed at quantity 100, unit price 9.00`

#### Scenario: Table checked with then
- **WHEN** the table test uses `then` on "the unit price follows this table"
- **THEN** it fails with `THEN the unit price follows this table: has a table, so check it with each`

#### Scenario: Duplicate scenario names
- **WHEN** the second pricing scenario is renamed "Volume discount tiers"
- **THEN** both pricing tests fail with `The pricing spec has two scenarios named "Volume discount tiers"`

#### Scenario: AND line added
- **WHEN** the spec gains `- **AND** the quote has no rounding step` under the percentage-code scenario
- **THEN** the test fails with `No assertion for: the quote has no rounding step`

### Requirement: Asynchronous and property checks
<!-- source: src/testing/scenario.ts, tests/trace-helper.test.ts -->
`run` SHALL count a call as started when it is made. It SHALL count the call
as settled when it returns a value that isn't a promise, or when the promise it
returned settles. A check SHALL count as asserting its outcome only if at least
one call has settled when the check completes. A call to `run` made inside a
check counts, so a check can run a property test that calls `run` many times.

When a check returns a promise, `then` and `each` SHALL return a promise that
settles after it, and `each` SHALL await each row's check before the next row.
The helper SHALL await every such promise after `body` returns and before its
final checks.

#### Scenario: Property test inside then
- **WHEN** a `then` check runs a property over 100 generated inputs, each calling `run`
- **THEN** the outcome counts as asserted and the test passes

#### Scenario: Check before an async function settles
- **WHEN** the covered function is async and a `then` check completes before the promise `run` returned has settled
- **THEN** the test fails with `THEN <text>: checked before <fn> settled`

### Requirement: Testing entry point
<!-- source: src/testing/index.ts, package.json, tests/trace-helper.test.ts -->
`src/testing/index.ts` SHALL export `scenario` and its types. It SHALL build to
`dist/testing/index.js` with `dist/testing/index.d.ts`. Every module reachable
from it SHALL import only `node:` built-ins and osq's own relative modules.
`scenario` SHALL be generic over the covered function, so `run` takes that
function's parameters and returns its return type, and an `each` row is
`Record<string, string>`.

#### Scenario: Only built-ins
- **WHEN** every module reachable from `src/testing/index.ts` is read
- **THEN** each bare import specifier starts with `node:`

#### Scenario: Typed run
- **WHEN** a test passes a string to `run` for a function that takes a number
- **THEN** `pnpm typecheck:cli` reports an error

### Requirement: Traceability tags
<!-- source: src/core/trace/tag-scan.ts, tests/trace-scan.test.ts -->
The scanner SHALL read tags only from a `/** ... */` doc comment whose closing
line is directly above one of these declarations:

- `export function <name>` or `export async function <name>`
- `export const <name>` with an optional type annotation, bound to an arrow
  function, an async arrow function, a function expression, or an async
  function expression

Inside such a comment, a line `@scenario <capability>: <scenario name>` names a
scenario the function serves, and a line `@adr <digits>` names a decision it
follows. A function may carry several of each. The scanner SHALL also record
every exported function in those forms, tagged or not, with its file, line,
and name.

Any comment line holding `@scenario` or `@adr` that the scanner can't attach to
one of those declarations SHALL be recorded as unreadable, with its file, line,
and reason. So SHALL a `@scenario` without `<capability>: <name>` and an `@adr`
without digits.

#### Scenario: Tagged arrow const
- **WHEN** a doc comment with `@scenario pricing: Volume discount tiers` and `@adr 001` sits directly above `export const quote = (quantity: number) => ...`
- **THEN** the scanner records `quote` serving that scenario and following ADR 001

#### Scenario: Tag above an unread form
- **WHEN** a doc comment with `@scenario pricing: Volume discount tiers` sits above `export default function (quantity) {`
- **THEN** the scanner records the tag as unreadable with its file and line

### Requirement: Scenario calls
<!-- source: src/core/trace/tag-scan.ts, tests/trace-scan.test.ts -->
A file SHALL count as a scenario test file when it imports from
`@matteeh/osq/testing`. In such a file, the scanner SHALL read every call to
`scenario(` whose capability and name are single- or double-quoted string
literals without escapes, and whose third argument is `{ covers: <identifier> }`.
The call may span lines. It SHALL record the file, line, capability, name, and
covered identifier. Any other `scenario(` call in the file SHALL be recorded as
unreadable, with a reason naming which of capability, name, or `covers` isn't
a literal. So SHALL an import of `scenario` under another name.

#### Scenario: Non-literal name
- **WHEN** a scenario test file calls `scenario('pricing', NAME, { covers: quote }, ...)`
- **THEN** the scanner records the call as unreadable because its name isn't a literal

### Requirement: Scenario index
<!-- source: src/core/trace/scenario-index.ts, tests/trace-scan.test.ts -->
The scenario index SHALL hold every scenario call, every exported function with
its tags, and every unreadable form. It SHALL be built from one list of files,
the import graph's files, once per lint, report, or show run. It SHALL persist
nothing. A test SHALL cover a function when its covered identifier equals the
function's name and the test file imports the function's file directly,
according to the import graph.

#### Scenario: Test covers the tagged function
- **WHEN** `tests/pricing-quote.test.ts` imports `../src/pricing/quote.js` and calls `scenario('pricing', 'Volume discount tiers', { covers: quote }, ...)`
- **THEN** the index says that test covers `quote` in `src/pricing/quote.ts` for that scenario
