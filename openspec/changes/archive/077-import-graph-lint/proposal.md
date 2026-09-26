---
title: Import-graph lint
depends_on:
  - "075"
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
    - watcher-and-harness
    - cli-foundation
    - status-inspection
---
## Goal

Lint follows the imports of every scoped file, for JavaScript and TypeScript
first, and warns about the scope mistakes that cost the ts-paas run most. A
planner learns at lint time which frozen tests its change reaches, which
capabilities it reads without saying so, and which it writes without a delta.
The watcher's import fan-in measure uses the same graph. Covers roadmap item 2.3,
which merges the old 2.4 with the reads half of 4.6, and replaces the carried
brief `briefs/later/2.4-impact-and-verify-quality-lint.md`.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests on temporary
repositories prove that:

- a scoped file imported by a preexisting test two levels away warns, and the
  warning goes away when a task declares `tests.modify: true` with that test
  in scope
- a scoped file importing code owned by an undeclared capability warns, and
  listing the capability in `features.reads` clears it
- a scoped file owned by a capability without a delta warns
- a task whose verify names only tests that import nothing in its scope warns
- a Python-only repository gets none of the import-graph warnings and no errors
- the measures fan-in count on osq's own repository equals a search for whole
  import specifiers, and every existing `tests/measures.test.ts` case passes

## Non-goals

- Blocking on any of these warnings. None of them blocks approval.
- Resolving `tsconfig` path aliases or package exports.
- Languages other than JavaScript and TypeScript.
- Changing measures events already recorded.

## Surface

- Added: lint warnings for frozen tests a task reaches, a capability read without declaring it, a capability written without a delta, and a verify that tests nothing in scope (lint messages)
- Added: `limits.importGraphDepth` and `limits.maxListedImporters` (config keys)
- Changed: the `measures` event's import fan-in counts whole import specifiers, so a file whose name prefixes another's no longer counts that file's importers (event data)

## Background

`countImportFanIn` in `src/watcher/measures.ts` counts `src/**/*.ts` files that
import a scoped file by searching each file's text for the specifier without its
extension. That search also matches prefixes: `./codex` matches
`./codex-prompt.js`. Measured on osq's own repository, it over-counts 15 of 167
`src/` files, such as `src/core/report/planning.ts` (25 instead of 10). A graph
prototype that resolves relative imports matched a search for whole specifiers
on all 170 `src/` TypeScript files, and built the graph of 469 files in under
200 ms. `measures.ts` is 249 lines, and the graph replaces its `listTsFiles` and
`importSpecifier` helpers.

A task changes a preexisting test only with `tests.modify: true` and a scope
entry covering it. `captureTestGate` in `src/watcher/verify.ts` treats every
file under `tests/` as a preexisting test. Each living spec's `### Requirement:
Code ownership` names its globs in a `<!-- source: ... -->` comment that
`parseCodeOwnership` in `src/core/spec/parser.ts` reads, and
`scopeCoversPath` in `src/core/run/scope.ts` matches a path against globs. Two
capabilities can own one file: `src/cli/report.ts` is under both
`cli-foundation`'s `src/cli/**` and `metrics-and-reporting`'s own list.
`listNamedPaths` in `src/core/spec/verify-paths.ts` lists the paths a verify
command names.

Measured with the prototype on osq's changes 070 to 076, per-pair warnings
would flood: tasks reach 3 to 186 preexisting tests within two import levels,
and 37 to 250 test and file pairs import a scoped file directly. So the
frozen-test warning is one per task, with the count, the direct importers
first, and a list capped by `limits.maxListedImporters`. Undeclared reads
appeared in six of seven changes, mostly `cli-foundation` through
`src/core/foundation/config.ts`, so that warning is one per capability. Writes
without a delta appeared 0 to 2 times per change, and a verify that tests
nothing in scope once, in 070.

`lintChangeFolder` in `src/core/spec/linter.ts` collects findings in a
`LintFindingSet` from `src/core/spec/lint-findings.ts`, and `lintCommand` in
`src/cli/lint.ts` lints every requested change in one run. `linter.ts` is on
the line-budget allow list, so the new checks live in new modules and
`linter.ts` only calls them. Lint limits come from `limits` in
`src/core/foundation/config.ts`.

## Contract

### Requirement: Frozen test reach warning
Lint SHALL warn once per task whose scope is imported, within
`limits.importGraphDepth` levels, by a preexisting test no task in the change may
modify.

#### Scenario: Test two levels away
- **WHEN** `tests/a.test.ts` imports `src/b.ts`, which imports scoped `src/c.ts`
- **THEN** lint warns naming `tests/a.test.ts` and `src/c.ts`

## Human steps

None

## Delta

- `specs/spec-lint-and-approve/spec.md`: adds "Import graph", "Import
  specifier resolution", "Frozen test reach warning", "Frozen test warning
  text", "Undeclared capability read warning", "Capability write without delta
  warning", "Verify without scope test warning", and "Import graph built once
  per lint run".
- `specs/watcher-and-harness/spec.md`: adds "Import fan-in from the shared
  graph".
- `specs/cli-foundation/spec.md`: adds "Import graph lint limits".

Two tasks; no file is shared. Task 1 owns `src/core/spec/import-graph.ts`,
which task 2 imports.
