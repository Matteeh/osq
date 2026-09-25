---
title: Mutation checks for opted-in scenarios, observe only
depends_on:
  - "082"
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - watcher-and-harness
    - metrics-and-reporting
    - status-inspection
    - traceability
---
## Goal

For every covered function a task changes or newly tests, the record shows how
many of its mutants the scenario tests kill, and lists the survivors. Nothing
blocks. When `traceability.mutation` is set, the watcher runs the project's
mutation command after a task passes. Each run is scoped to one covered
function, together with the private helpers it calls in its own file, and to
the test files that name its scenarios. The watcher records what the tool's
report says. `osq show` and `osq report` put the survivors in front of a
reviewer. In a calculation capability, a survivor is often a question about
the spec, such as which tier a boundary quantity belongs to.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests with a fake
mutation command that writes a fixed JSON report prove that:

- a task that changes one covered function runs the command once, scoped to
  that function's ranges and the test files that name its scenarios
- a function two scenarios cover runs once, with the test files of both
- a private helper the covered function calls is mutated in the same run
- a task that only adds a scenario test for an existing function mutates that
  function
- killed and surviving mutants are recorded and shown in `osq show` and
  `osq report`
- a failing, slow, or garbled mutation command is recorded as not measured, and
  the task still lands
- functions left when the budget runs out are recorded as not measured
- with `traceability.mutation` unset, no command runs, no event is appended,
  and no start measure changes

## Non-goals

- Blocking, retrying, or gating archive on surviving mutants.
- A built-in mutation engine, or bundling StrykerJS.
- A StrykerJS runner plugin for `node:test`.
- Marking survivors as equivalent, or recording how a survivor was triaged.
  Every recorded survivor counts as not yet reviewed.
- Mutating code no scenario test covers, private helpers in other files, or the
  whole repository.
- Running the check for a task marked done by hand, or finishing a check the
  watcher was stopped in the middle of. The measurement is evidence only, and a
  missing one reads as not measured.

## Surface

- Added: `traceability.mutation.command` and
  `traceability.mutation.budgetSeconds` in `osq.config.ts` (config keys)
- Added: the `{mutate}`, `{tests}`, and `{report}` placeholders, and the
  `OSQ_MUTATE`, `OSQ_MUTATION_TESTS`, and `OSQ_MUTATION_REPORT` environment
  variables of the mutation command (command contract)
- Added: `functionHashes` in the `measures` start event, for tagged exported
  functions in scope (event field)
- Added: the `mutation_ran` event, one per picked function (event type)
- Added: the `Mutation:` and `Survived:` lines per task in `osq show`, and the
  `Mutation:` section and `mutation` JSON key of `osq report` (command output)
- Added: the reference StrykerJS setup in README.md (docs)

## Decisions

- ADR 001: the `mutation` block loads through the existing jiti config path.
  osq loads no StrykerJS code.
- ADR 002: archive is unchanged. The check runs before a passing task's change
  can archive, and never at archive.
- ADR 004: the change adds no validator call.
- ADR 005: no version check moves.

## Background

A trial ran StrykerJS 10.0.0 against a copy of `fixture/trace/pricing/`. It
used the command test runner, `npx tsc` as the build command, and
`node --test build/tests/pricing-quote.test.js` as the test command:

- The whole file gave 22 mutants in 2.7 s, and one survived:
  `code === undefined ? 0 : …` became `false`. It is equivalent, because
  `CODES[undefined] ?? 0` is 0 anyway.
- `quote`'s own lines (33–39) gave only 10 mutants. The tier boundaries live in
  the private `tierPrice`, so the vision's key finding never showed.
- `quote` plus `tierPrice` gave 19 mutants in 4.2 s. With the spec's boundary
  rows, only the equivalent mutant survived. With mid-tier rows only (1, 50,
  250, 750), both boundary mutants survived as well, as the vision predicts.

So a picked function's run also mutates the private helpers it calls in its
own file. The cost grows with that file, never with the repository, and the
per-task budget bounds the total. The human planning this weighed that against
enterprise-sized codebases and accepted it.

StrykerJS's CLI has `--mutate` but no flag for the command runner's command or
the JSON report path. The reference setup is therefore a `stryker.config.mjs`
that reads `OSQ_MUTATE`, `OSQ_MUTATION_TESTS`, and `OSQ_MUTATION_REPORT`. It maps
each `tests/*.ts` file to its compiled `build/tests/*.js`, so TypeScript is
compiled once by `buildCommand`, not through tsx on every mutant. Its JSON
report holds `files[<path>].mutants[]` with `status`, `mutatorName`,
`replacement`, and `location.start.line` and `column`, and the file keys are
relative to the project root. Without `thresholds.break`, StrykerJS exits 0
even with survivors.

Where each part runs:

- `src/watcher/runner.ts` and the other runner lifecycle modules are at their
  line budget. The check runs from `runWatcherCycle` in `src/watcher/loop.ts`,
  right after `runTask` succeeds and before the change can archive, through one
  call.
- The before-state of each function has to survive the agent's edits and a
  restart. So `gatherStartMeasures` records `functionHashes` in the task's
  `measures` start event, as it already records `dependencies`. It records
  only exported functions carrying a `@scenario` tag in scoped files, so a
  project without tags sees no change. The golden event scenario has an empty
  scope.
- The end `measures` event's `scopeHashes` already tells which scoped test
  files the task added or changed.

A trial that added the field and the event type broke no test beyond the seven
that fail without a UI build.

## Contract

### Requirement: Mutation is observe only
A mutation check SHALL never fail, retry, or halt a task. A command that
fails, times out, or writes an unreadable report SHALL be recorded as not
measured.

#### Scenario: Broken mutation command
- **WHEN** the mutation command exits 2 for the picked function
- **THEN** a `mutation_ran` event records it as not measured with reason `command_failed`, and the task stays done

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "Mutation configuration" and "Reference
  mutation setup".
- `specs/traceability/spec.md`: adds "Function ranges", "Function baseline", and
  "Mutation picks".
- `specs/watcher-and-harness/spec.md`: adds "Mutation command", "Mutation
  report reading", and "Mutation check after a pass".
- `specs/status-inspection/spec.md`: adds "Mutation in show".
- `specs/metrics-and-reporting/spec.md`: adds "Mutation in report".

Five tasks, and no file is shared. Task 1 owns the config. Task 2 owns
`src/harness/types.ts`, including the `mutation_ran` event type that tasks 4
and 5 use, and the function ranges that task 3 uses. Task 3 owns picking and
running, which task 4 calls.
