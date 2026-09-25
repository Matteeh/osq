# Spec Delta: Traceability

## ADDED Requirements

### Requirement: Function ranges
<!-- source: src/core/trace/function-ranges.ts, tests/trace-function-ranges.test.ts -->
osq SHALL find each top-level function in a JavaScript or TypeScript file. A
top-level function is a declaration at column 0 in one of the forms "Traceability
tags" reads, with or without `export`. Its range SHALL start at the declaration
line. It SHALL end at the last non-blank line before the next line that starts
at column 0 with anything other than `}`, `)`, `]`, or `;`, or at the end of
the file. The range is known only when its `(`, `[`, and `{` balance, counted
outside strings, template literals including their `${}` parts, and comments.

A covered function's mutation ranges SHALL be its own range plus the range of
every non-exported top-level function in the same file that it calls, directly
or through another such function. A call is the function's name followed by `(`
outside strings and comments. The ranges SHALL be sorted by start line and
written `<file>:<start>-<end>`. When any of them isn't known, the function's
ranges are unknown.

#### Scenario: Private helper included
- **WHEN** exported `quote` on lines 33–39 calls the non-exported `tierPrice` on lines 20–24
- **THEN** `quote`'s mutation ranges are `src/pricing/quote.ts:20-24` and `src/pricing/quote.ts:33-39`

#### Scenario: Braces inside strings
- **WHEN** a function body holds the string `'{'` and a template literal `` `${a}}` ``
- **THEN** its range still ends at its closing line

### Requirement: Function baseline
<!-- source: src/core/trace/function-ranges.ts, src/watcher/measures.ts, src/harness/types.ts, tests/trace-function-ranges.test.ts -->
The `measures` start event SHALL hold `functionHashes`. For each exported
function with at least one `@scenario` tag, in a scoped JavaScript or TypeScript
file, it maps `<file>#<name>` to the `sha256:` hash of the text of the
function's own range, or to null when that range isn't known. The event SHALL
leave the field out when no such function exists.

#### Scenario: Untagged scope
- **WHEN** a task's scope holds no exported function with a `@scenario` tag
- **THEN** its `measures` start event has no `functionHashes`

### Requirement: Mutation picks
<!-- source: src/core/trace/mutation-pick.ts, tests/mutation-pick.test.ts -->
After a task passes, osq SHALL pick covered functions from the scenario index,
built once. A covered function is an exported function that has a `@scenario`
tag naming an opted-in capability, and some scenario test file naming one of
those tagged scenarios. A covered function SHALL be picked when either:

- its file is in the task's resolved scope, and its own range's hash differs
  from the task's latest `measures` start event's `functionHashes` entry for
  it, a missing entry counting as different; or
- a scenario test file that the task's latest end `measures` event shows with
  a different `before` and `after` hash covers it.

Each pick SHALL carry the file, the name, the mutation ranges, the tagged
opted-in scenarios as `<capability>: <name>`, and the tests. The tests are the
sorted, distinct scenario test files that name any of those scenarios. Picks
SHALL be ordered by file, then start line.

#### Scenario: Two scenarios, one run
- **WHEN** a task changes `quote`, which is tagged with two pricing scenarios named by `tests/pricing-quote.test.ts` and `tests/pricing-codes.test.ts`
- **THEN** one pick for `quote` holds both test files

#### Scenario: New test for an unchanged function
- **WHEN** a task leaves `quote` unchanged but adds `tests/pricing-bulk.test.ts`, which covers `quote`
- **THEN** `quote` is picked

#### Scenario: Unchanged and untested
- **WHEN** a task changes neither `quote` nor any scenario test covering it
- **THEN** `quote` is not picked
