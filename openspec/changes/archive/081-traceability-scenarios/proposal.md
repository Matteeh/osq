---
title: Opt-in scenario traceability
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - watcher-and-harness
    - metrics-and-reporting
    - status-inspection
---
## Goal

For every capability a project opts in, osq can answer three questions
deterministically. Which tests prove each scenario? Which scenario does each
exported function serve, and which decision does it follow? Which tests does a
change to a scenario touch?

A test proves its scenario through `scenario` from `@matteeh/osq/testing`. It
names the scenario, asserts every THEN and AND line by its exact text, and checks
every row of an outcome's table. The expected values come from the approved
spec, so no agent types them. Lint checks the links, the report lists the gaps,
and a project that doesn't opt in and doesn't use the helper sees no change.
Covers roadmap stage 2 of the traceability vision.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests on temporary
projects prove that:

- the helper passes for a test that runs the covered function and asserts every
  outcome, including every row of a table
- the helper fails with the right message when one `then` is deleted, the spec
  gains an AND line, the table gains a row the code gets wrong, a number in a
  THEN changes, the test never calls `run`, a check finishes before the covered
  function returns or an async one settles, the check fails, `then` names text
  that isn't an outcome, `then` names an outcome with a table, or two scenarios
  in the capability share a name
- a check that runs a property test calling `run` counts as asserted
- with `OSQ_CHANGE` set, the helper finds a scenario only the change's delta
  adds, uses the delta's outcomes for one it modifies, and fails for one it
  removes; without it, the helper finds the scenario in the living spec or an
  active change, and fails naming `OSQ_CHANGE` when two places disagree
- the pricing sample passes, and each of its eight deliberate breaks fails with
  a message naming the same problem
- osq's spec lint and `openspec validate` both accept the sample spec with its
  table
- lint on an opted-in fixture reports each traceability finding, reports none
  for a capability that isn't opted in, flags an unreadable tag and a
  `scenario(...)` call with a non-literal name, and turns findings into errors
  under `mode: 'require'`
- a delta modifying a scenario lists the tests that name it and warns about a
  test no task scopes with `tests.modify`
- the report lists an untested scenario and an unclaimed exported function
- with no capability opted in and no test using the helper, lint output, the
  report, and both managed blocks are unchanged

## Non-goals

- Mutation checks (`traceability-mutation`).
- Running a task's scenario tests before its full verify
  (`traceability-fast-feedback`).
- Coverage runs proving a function executes when a test calls it indirectly.
- Class methods.
- Checking WHEN lines.
- The per-kind change contracts from the vision.
- Test runners other than `node:test`, and languages other than JavaScript and
  TypeScript.
- Requiring tags on functions that aren't exported.
- A persistent scenario index cache. Hashing a file means reading it, so a
  hash-keyed cache would save only the regex pass, measured at 67 ms for 56,000
  lines. The index is built once per lint, report, or show run instead.
- A TypeScript parser. Adding one would be a fifth runtime dependency.

## Surface

- Added: `traceability.capabilities` and `traceability.mode` in `osq.config.ts`
  (config keys)
- Added: a Markdown table directly under a THEN or AND line of a scenario (spec
  format)
- Added: the `@matteeh/osq/testing` package subpath, exporting `scenario`, whose
  body receives `run`, `then`, and `each` (package export)
- Added: `@scenario <capability>: <name>` and `@adr <number>` doc comment tags
  (source tags)
- Added: the `## Scenarios` section of a task file, one
  `- <capability>: <scenario name>` bullet per scenario the task's tests prove
  (task section)
- Added: the `OSQ_CHANGE` environment variable in every verify the watcher runs
  (environment)
- Added: lint findings for an untested scenario, a tag naming a missing
  scenario, a tagged function no test covers, a tag naming a missing or
  out-of-scope ADR, two scenarios with the same name, a tag or `scenario(...)`
  call lint can't read, and the tests a changed scenario touches (lint output)
- Added: the `Traceability:` section of `osq report` and the `traceability` key
  of its JSON, and the `Scenarios:` line per task in `osq show` (command output)
- Added: the `<!-- OSQ:TRACEABILITY:START -->` block in AGENTS.md and PLANNER.md,
  written by `osq init` and checked by `osq doctor` (managed blocks)

## Decisions

- ADR 001: the traceability config loads through the existing jiti config path.
  The test helper loads no config and no TypeScript.
- ADR 002: archive merging is unchanged. The effective spec reuses `mergeDelta`
  instead of a second merger.
- ADR 004: accepting a table adds no validator call. The one real-validator test
  runs the local bin with `OPENSPEC_TELEMETRY=0`, `--strict`, `--json`, and
  `--no-interactive`.
- ADR 005: no version check moves.

## Background

`openspec validate` 1.13.1 accepts a table under a THEN line, flush or
indented, in a living spec and in a MODIFIED delta. A trial change whose delta
put a table under a THEN linted valid with no finding. The vision's sample spec
fails `openspec validate` as written, because it has no `## Purpose` and uses
plain `- WHEN` bullets. The fixture uses osq's format, with a `## Purpose` and
bold `**WHEN**`, `**THEN**`, and `**AND**`, and then validates.

`parseScenario` in `src/core/spec/delta.ts` keeps only THEN lines, as `then`.
It drops AND lines and tables, and only `tests/delta-merge.test.ts` reads `then`.
The raw block keeps tables, so merging already carries them.

Every watcher verify goes through `runVerificationCommand` in
`src/core/run/verification.ts`. It is called directly by
`runVerificationGateResult` in `src/watcher/verify.ts`, which receives
`specFolderPath` from every watcher gate, by `runCheck` in
`src/core/lifecycle/verification-record.ts`, and by `retrySpec` in
`src/core/lifecycle/retry.ts`. Archive verifies run before the merge, while the
change folder is still active. A trial that gave `runVerificationCommand` a
required change-folder argument, and added `traceability` to `DEFAULT_CONFIG`
and `DeltaScenario.outcomes`, broke no typecheck and no test.

Executors read AGENTS.md themselves, and the ADR rules block in
`src/core/foundation/rules-block.ts` is a separately marked block that init
writes and doctor checks. The traceability sections follow that model as their
own marked blocks right after the managed block. The managed blocks' text stays
fixed, so nothing changes for projects that don't opt in.

The helper runs in the consumer's test process. It lives in `src/testing/`,
builds to `dist/testing/`, and reaches only Node built-ins and osq's own
modules. A file uses the helper when it imports `@matteeh/osq/testing`, so
osq's own tests, which import the source directly, never feed the scanner. The
fixtures live under `fixture/`, which typecheck and biome skip, so the sample
test imports `@matteeh/osq/testing` exactly as a consumer would. Tests that run
it rewrite that specifier to `src/testing/index.ts`.

Because the watcher will set `OSQ_CHANGE` for osq's own verify runs, every test
that runs the helper must set or delete `OSQ_CHANGE` itself.

## Contract

### Requirement: Scenario helper
A test SHALL prove a scenario through `scenario(capability, name, { covers }, body)`,
which fails unless the covered function ran through `run`, every outcome was
asserted, and every row of every outcome table passed.

#### Scenario: Table row the code gets wrong
- **WHEN** the pricing spec's table gains the row quantity 1000 at unit price 7.00 and the code prices it at 8.00
- **THEN** the test fails with `THEN the unit price follows this table: failed at quantity 1000, unit price 7.00`

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/traceability/spec.md`: new capability. Adds "Code ownership",
  "Effective scenario lookup", "Scenario helper", "Scenario helper failures",
  "Asynchronous and property checks", "Testing entry point", "Traceability
  tags", "Scenario calls", and "Scenario index".
- `specs/spec-lint-and-approve/spec.md`: adds "Scenario outcomes", "Scenario
  tables accepted", "Planned scenarios", "Traceability links", "Unreadable
  traceability forms", and "Scenario blast radius".
- `specs/watcher-and-harness/spec.md`: adds "Change folder in verify
  environment".
- `specs/cli-foundation/spec.md`: adds "Traceability configuration",
  "Testing package subpath", and "Traceability instruction blocks".
- `specs/metrics-and-reporting/spec.md`: adds "Traceability gaps in report".
- `specs/status-inspection/spec.md`: adds "Scenarios in show".

Nine tasks, and no file is shared. Task 1 owns `delta.ts`, which task 4 reads.
Task 2 owns the config that tasks 7 through 9 read. Task 4 owns the lookup
that tasks 5 and 7 use. Task 5 owns `fixture/trace/pricing/**`, which task 7's
tests copy. Task 6 owns the scanner and index that tasks 7 and 8 use.
