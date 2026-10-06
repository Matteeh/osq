---
title: One of osq's own capabilities is opted into traceability
depends_on: []
verify: pnpm verify
features:
  reads: [spec-lint-and-approve, status-inspection, watcher-and-harness]
---
## Goal

osq opts its own `traceability` capability into traceability in `warn` mode,
with focused tests and StrykerJS mutation checks. Its scenarios are linked to
tests through the scenario helper, and its functions carry `@scenario` tags.
ADR 011 then measures whether links and mutation checks earn a place: as a
blocking gate, on more capabilities, or not at all. ADR 006 decision 4 allows
a warning only while its signal is being measured, so the ADR names the
signals, the thresholds and the date.

The roadmap calls this the biggest gap between self-documenting and true.
Traceability shipped in 081 and 083, and no capability has opted in since.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
`tests/trace-own-config.test.ts` loads osq's own config, the Stryker config,
and the helper by its package name. `tests/doctor.test.ts` already checks the
managed traceability blocks on this repository. The four
`tests/trace-own-links-*.test.ts` files check each tag with `scanSource`, each
linked scenario with the repository's scenario index, and the line budget of
each tagged file. The scenario tests themselves run in the suite.

## Non-goals

- `require` mode, or opting in any other capability.
- Changing traceability's code. Tasks add `@scenario` lines to doc comments,
  and two of them remove blank lines or shorten comment prose to stay within
  250 lines. No code line changes.
- Making mutation checks block, or feeding traceability results to the
  validator (ADR 010).
- Fixing what the measurement found; see `## Found while measuring`.

## Surface

- Changed (osq's own repository only): `osq.config.ts` gains a
  `traceability` block for `traceability` in `warn` mode, with
  `focusedTests` and `mutation`.
- Added (osq's own repository only): `stryker.config.mjs`, the dev
  dependency `@stryker-mutator/core` 10.0.0, and a `paths` entry in
  `tsconfig.json` mapping `@matteeh/osq/testing` to `./src/testing/index.ts`.
- Added (osq's own repository only): the `## Traceability` managed blocks in
  AGENTS.md and PLANNER.md, which `osq init` writes for an opted-in config.
- Added: ADR 011, "Traceability trial".
- Added: traceability requirement "Own scenario tests", the rules for
  scenario tests in osq's own repository.

## Decisions

- ADR 001: the `traceability` block loads through the existing jiti config
  loader. `stryker.config.mjs` is Stryker's own file, and osq never loads it.
- ADR 004: unaffected.
- ADR 005: unaffected.
- ADR 010: the validator block in `osq.config.ts` stays as it is, and the
  validator is not given traceability results in this change.

**Why traceability, measured on 2026-10-06.** With each candidate opted in,
`collectTraceabilityGaps` on this repository gave:

| capability | untested scenarios | unclaimed functions | files |
| --- | --- | --- | --- |
| traceability | 36 | 16 | 8 |
| version-control | 98 | 58 | 20 |
| web-inspection | 83 | 153 | 73 |
| metrics-and-reporting | 152 | 112 | 41 |
| status-inspection | 189 | 119 | 46 |

Traceability fits in one change. Version-control, where 149's bug lived, has
almost three times the scenarios and spans 20 files, so it would take several
changes before the trial even started. Version-control is the first candidate
if the trial decides to widen.

**StrykerJS, not a homegrown mutator.** The human chose the README's
reference setup, so the trial measures what osq tells projects to run. It is
a dev dependency, so the runtime dependency rule needs no ADR. The config
departs from the README's in two places. It runs tests through `tsx` with no
build, because osq's tests are TypeScript run by `tsx`. It also keeps
Stryker's sandbox in the folder of `OSQ_MUTATION_REPORT`. A failed Stryker run
leaves its sandbox behind, and a sandbox inside the tree is walked by
`buildImportGraph`. That doubles every scenario test file in the index, the
focused files and lint. osq already removes the report folder after each
pick, so the sandbox goes with it, even after a timeout kill.

**The helper by its package name.** The scanner counts a file as a scenario
test file only when it imports `@matteeh/osq/testing`. Inside this repository
that name resolves to `dist/testing/index.js`, which a fresh worktree lacks
until the build, and `pnpm verify` typechecks before it builds. A `paths`
entry in `tsconfig.json` makes both `tsc` and `tsx` resolve it to
`src/testing/index.ts`. Both were checked with `dist/` removed.

**New test files, except for the helper's own scenarios.** Following the
brief, scenario tests go in new `tests/trace-scenarios-*.test.ts` files that
traceability owns. The exception is 11 of the scenario helper's scenarios.
`tests/trace-pricing.test.ts` and `tests/trace-helper.test.ts` already prove
them by running child test processes, which takes 37 s and 18 s. New files
would add about 55 s to every `pnpm verify` and to every mutation run of
`scenario`, so task 6 converts those two files in place.

**Tag checks live outside scenario test files.** A mutation run executes
every scenario test file that names a picked function's scenarios, against a
sandbox copy whose picked file Stryker has instrumented. A test that reads
that file's text fails Stryker's initial run. That happened with the existing
`tests/trace-function-ranges.test.ts`. So the checks that read source text
(`tests/trace-own-links-*.test.ts`) never import the testing helper, and no
scenario test reads the text of a file whose functions carry its scenarios.

## Contract

### Requirement: osq traces its own traceability capability

osq's own repository SHALL opt `traceability` into traceability in `warn`
mode, and its tests SHALL import the helper by package name without a build.

#### Scenario: Own traceability config
- **WHEN** `loadConfig` reads osq's own repository
- **THEN** its `traceability` is `traceability` in `warn` mode, with the tsx focused command and `npx stryker run` under a 300-second budget

### Requirement: osq's own mutation setup

osq's StrykerJS config SHALL keep its sandbox beside osq's report file,
outside the tree.

#### Scenario: Mutation sandbox beside the report
- **WHEN** `stryker.config.mjs` loads with `OSQ_MUTATION_REPORT` set to `/tmp/x/mutation.json`
- **THEN** its `tempDirName` is `/tmp/x/stryker`

### Requirement: Own scenario tests

A traceability scenario test in osq's own repository SHALL NOT read the text
of a file whose functions carry its scenarios.

#### Scenario: Source checks outside scenario tests
- **WHEN** every `tests/trace-own-links-*.test.ts` file is read
- **THEN** none mentions `@matteeh/osq/testing`

## Human steps

### Before approval

None

### After landing

- Run `pnpm install` in the checkout for the new dev dependency, then
  `pnpm build`, and restart `osq watch`. The watcher loads `osq.config.ts`
  once at start, so focused runs and mutation checks begin with the first
  task after the restart that touches a tagged traceability function or a
  traceability scenario test.

## Delta

- `specs/cli-foundation/spec.md`: adds "osq traces its own traceability
  capability" and "osq's own mutation setup".
- `specs/traceability/spec.md`: adds "Own scenario tests".

Six tasks, in order, sharing no file. Task 1 opts in: config, dev
dependency, Stryker config, `tsconfig.json` path and managed blocks. Task 2
writes ADR 011. Tasks 3 to 6 link the scenarios, one area at a time: lookup,
scanner and paths, ranges and picks, and the helper. Tasks 3 to 6 need task
1's `tsconfig.json` path. Task 2's ADR names task 1's test as its check.

## Found while measuring

Measured on 2026-10-06 in a scratch worktree with this change's config, tags
and one scenario test applied. None of this is fixed here.

- **Scenarios linked.** Before: 0 of 36. After this change: 35 of 36.
  "Typed run" stays unlinked because it is a compile-time property:
  `pnpm typecheck:cli` proves it through the `@ts-expect-error` probe in
  `tests/trace-helper.test.ts`, and a scenario test would need a `tsc` run.
  Four linked scenarios have no tagged function, because no traceability
  function serves them. "Codebase ownership boundaries" and "Only built-ins"
  are served by spec-lint-and-approve's `readCapabilityOwnership` and
  `reachImports`. "One definition" and "Show uses it" are properties of other
  files' source.
- **Functions claimed.** Before: 0 of 16. After: 10 of 16. Six stay
  unclaimed because no living traceability scenario names what they do:
  `clearLookupRootCache`, `clearScenarioLookupCache` and
  `scenarioSpecReadCount` are test seams for the per-process caches.
  `findOpenspecRoot` is the ancestor search, which has no scenario.
  `effectiveScenarios` serves lint. `hashFunctionRange` serves the pick's
  change test, which `pickMutations`' scenarios prove.
- **Unreadable forms.** 21 in the repository, unchanged by this change. Nine
  are deliberate, in test fixtures written as strings. The twelve in `src/`
  are all doc comment prose that mentions `` `@scenario` ``, in
  `report-traceability.ts` (4), `traceability-links.ts`, `function-ranges.ts`,
  `mutation-pick.ts` (2), `tag-scan.ts` (2) and `system-graph-types.ts` (2).
  The scanner reports a prose mention as an invalid tag. These are false
  positives, and lint will warn about them whenever a change scopes one of
  those files. ADR 011 counts them.
- **Ranges osq cannot measure.** `scanSource`'s mutation ranges are unknown,
  because `tag-scan.ts`'s helpers hold regular expression literals with
  unbalanced `(` and `[`, and "Function ranges" counts brackets outside
  strings and comments only. Every pick of `scanSource` will be
  `range_unknown`.
- **Mutants and time per pick**, with the existing tests, through
  `runMutationPick` and the config above:

| function | tests | mutants | killed | survived | time |
| --- | --- | --- | --- | --- | --- |
| `isTestPath` | one scenario test | 18 | 14 | 4 | 5 s |
| `pickMutations` (own range) | `tests/mutation-pick.test.ts` | 23 | 16 | 7 | 4 s |
| `scenario` | `tests/trace-helper.test.ts` | 142 | 119 (77 timeouts) | 23 | 171 s |

  The four `isTestPath` survivors include `lastIndexOf('/') + 1` mutated to
  `- 1`, which the scenario's four example paths cannot tell apart. Under ADR
  011 a human labels each survivor as a missing assertion or noise. A pick of
  `scenario` uses more
  than half the 300-second budget, so a task that changes the helper and
  another tagged function may record `budget` for the second pick.
- **Focused runs** of one traceability scenario file take 1 to 2 s.
- **Thrown outcomes.** The helper's `run` counts a call as settled only
  when it returns. A synchronous function that throws is never settled, so
  any `then` after it fails with `checked before <fn> settled`. A scenario
  whose THEN is an error, such as "Removed scenario", must cover a wrapper
  that returns the error. Task 3 does that with a test-local
  `lookupFailure`. The tag on `lookupScenario` still makes those scenarios
  part of its picks.

## Background

**Config.** `validateTraceabilityConfig` in
`src/core/foundation/config-traceability.ts` checks the block, and
`MutationConfig` requires `budgetSeconds` in the type, so the config states
300. `loadConfig` checks that `traceability` names a living capability.
`osq doctor`'s managed-blocks check fails on an opted-in project until
AGENTS.md and PLANNER.md carry the blocks `renderTraceabilityBlock` writes.
`osq init` refreshes them and changes nothing else in this repository.
CLAUDE.md is a link to AGENTS.md.

**Mutation contract.** `runMutationPick` in `src/core/run/mutation-run.ts`
runs the command through the verify role's environment, with `OSQ_MUTATE`,
`OSQ_MUTATION_TESTS` and `OSQ_MUTATION_REPORT` set, in a fresh
`osq-mutation-*` folder under the OS temp folder that it always removes.
Stryker 10 accepts `<file>:<start>-<end>` entries in `mutate`. Its default
`ignorePatterns` skip `node_modules`. The config also skips `dist`, the UI
builds and `openspec/changes`. The scenario helper's lookup reads the change
through `OSQ_CHANGE` or the worktree, not the sandbox, and the archive's
event files are large.

**Lookup in this repository.** The helper looks scenarios up from
`process.cwd()` and `process.env`. Under the watcher, `OSQ_CHANGE` names the
change. Run by hand in the checkout, it reads the living spec plus any
active change's delta for `traceability`.

**Line budgets.** Tagging takes one line per tag, plus three when a one-line
doc comment opens up. `tag-scan.ts` and `function-ranges.ts` sit at 249
lines and reach 254 when tagged. They have 21 and 13 blank lines.
`scenario-lookup.ts` reaches 245 and `src/testing/scenario.ts` 224.
