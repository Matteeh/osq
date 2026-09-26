---
title: Architecture decision checks
depends_on:
  - "079"
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - watcher-and-harness
    - status-inspection
    - metrics-and-reporting
---
## Goal

The mechanical core of an architecture decision holds whatever an agent does.
An ADR can name the tests that enforce it in `checks` and the packages it
forbids in `denies`. `osq doctor` makes sure the named tests exist, the
approval digest flags a task allowed to edit one, and the watcher stops a task
that adds a denied package to a `package.json` in its scope. The watcher also
records every dependency a task adds, so `osq show` and `osq report` show what
each change brought in. Covers roadmap stage 2.8b, on top of change 079.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests on temporary
projects prove that:

- an accepted ADR naming a missing check file fails `osq doctor`
- a task with `tests.modify: true` whose scope covers an accepted ADR's check
  file raises `adr_check_modified`, and `osq report` counts it
- the same task without `tests.modify` raises no new flag, and the frozen-test
  gate still kills an edit to the check file with `undeclared_test_change`
- a fake agent that adds `vue` to a scoped `package.json` while an accepted
  ADR denies it dies with `denied_dependency` naming the package and the ADR
- that death is retried automatically once, and the retry's prompt names the
  package
- adding a package no ADR denies passes, and the addition appears in
  `osq show` and `osq report`
- a package denied only by a superseded ADR is not enforced
- a `package.json` outside the task's scope is never read for the check

## Non-goals

- Import-boundary or structure rules built into osq. Those belong in the
  project's own tests, named in `checks`.
- Ecosystems other than npm.
- Version constraints on allowed dependencies.
- A gate requiring an ADR for every new dependency.
- Adding `checks` or `denies` to osq's own ADRs.

## Surface

- Added: ADR frontmatter fields `checks` and `denies` (frontmatter fields)
- Added: the `adr_check_modified` approval flag (approval output)
- Added: the `denied_dependency` dead reason, eligible for an automatic retry
  (dead reason)
- Added: the `dependencies_added` event, and the `dependencies` field of the
  `measures` start event (event types)
- Added: the `Dependencies added:` line per task in `osq show`, and the
  dependencies added per change in `osq report` (command output)
- Changed: the `decisions` doctor check fails on a missing check file or a
  malformed `checks` or `denies` (doctor check)

## Decisions

- ADR 001: no new config key; nothing new loads TypeScript.
- ADR 002: archive keeps merging this change's deltas without a model; the
  dependency gate runs before verify, never at archive.
- ADR 004: the new flag and gate add no validator call.
- ADR 005: no version check moves; the validator gate is unchanged.

## Background

Change 079 gave ADRs frontmatter, read by `readDecisions` in
`src/core/foundation/decisions.ts` (231 lines), validated by
`validateDecisions` in the same file, and checked by `checkDecisions` in
`src/core/foundation/doctor-decisions.ts`. `collectDigestDecisions` in
`src/core/spec/digest-decisions.ts` lists governing ADRs and raises
`adr_departure`. Every existing test writes ADRs as files, so new `Adr` fields
break no test literal.

`src/watcher/runner.ts` is 199 lines, and `tests/import-graph.test.ts` keeps it
strictly under 200, so the runner gains no line. `createTaskMeasures` in
`src/watcher/measures.ts` emits the `measures` start event just before every
spawn, retries included, so the dependency baseline rides on that event and
survives a watcher restart. `runPreSpawnVerify` runs only before the first
attempt, so it can't carry the baseline. After the agent exits,
`checkBlockedFirst` in `src/watcher/task-verify.ts` already runs the post-exit
checks. The runner calls it with five arguments, and passing the `verifyCtx`
object it already builds keeps the call on one line. A retry's prompt carries
the retained dead marker body, so a marker that names each package puts it in
the next prompt.

A rough version in a scratch worktree broke only
`tests/report-approval-flags.test.ts` and `tests/report-json.test.ts`, whose
`fixture/report/expected.json` pins the flag ids. That version added the
optional `measures` field, the `dependencies_added` event, the dead reason,
its retry eligibility, and the flag id. The report's dependency list is left
out of stable JSON when empty, as `rework` is, so the fixture changes only for
the flag.

## Contract

### Requirement: Denied dependency
After the agent exits, the watcher SHALL kill a task with `denied_dependency`
when a `package.json` in its resolved scope gained a package that an accepted
ADR lists in `denies`.

#### Scenario: Vue denied
- **WHEN** accepted ADR 007 denies `vue` and the agent adds `vue` to a scoped `package.json`
- **THEN** the task dies with `denied_dependency`, and the marker names `vue`, the file, ADR 007, and its rule

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "Decision checks and denied packages"
  and "Decision check files in doctor".
- `specs/spec-lint-and-approve/spec.md`: adds "ADR check modification flag".
- `specs/watcher-and-harness/spec.md`: adds "Dependency baseline",
  "Dependencies added", and "Denied dependency"; modifies "Automatic retry" to
  make `denied_dependency` eligible.
- `specs/metrics-and-reporting/spec.md`: adds "ADR check flag outcomes" and
  "Dependencies added per change".
- `specs/status-inspection/spec.md`: adds "Dependencies added in show".

Four tasks; no file is shared. Task 1 owns `src/core/foundation/decisions.ts`,
which tasks 2 and 3 import. Task 3 owns `src/harness/types.ts` and the
`dependencies_added` event that task 4 reads.
