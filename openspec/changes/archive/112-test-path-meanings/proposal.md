---
title: Each meaning of "test path" has one function, and the spec says which consumer uses which
depends_on: []
verify: pnpm verify
features:
  reads:
    - metrics-and-reporting
    - version-control
---
## Goal

osq has two meanings of "test path". The frozen-test gate governs only
`tests` and paths under `tests/`. Traceability also counts any file whose
name holds `.test.` or `.spec.`. The split is deliberate, but nothing says
so, and each meaning is copied by hand into the code that uses it. Each
meaning gets one named function, every consumer calls it, and the living specs
say which consumer uses which.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. Every existing test that
covers a consumer passes unchanged: the runner's test gating, the git guard,
the verified task commit, the `tests.modify` lint, the frozen test reach
warning, the approval digest, and `osq show`'s scenarios. Two new tests check
each meaning's paths and that no consumer defines its own copy.

## Non-goals

- Changing either meaning, for example counting `.test.` files outside
  `tests/` as frozen.
- Making the gate's folder configurable.
- The approval flag "verify without a test". `verifyLacksTest` in
  `src/core/spec/digest-flags.ts` reads a verify *command*, not a path, and
  also accepts `test/`, `__tests__/`, and known runners. It answers a
  different question and stays as it is.
- Making traceability's `isTestPath` call the gate's function. The meanings
  are kept apart on purpose, and `src/core/trace/` gains no import from
  `src/core/run/`.

## Surface

None

## Decisions

- ADR 001: unchanged; the removed "Test gating configuration" described a configuration key `loadConfig` never had, and config loading does not change.
- ADR 002: archive merges this change's five deltas without a model, as for every change.
- ADR 004: unchanged; no validator call moves.
- ADR 005: unchanged; nothing here checks the validator range.

## Background

**Two copies the brief missed.** Besides the four copies of the gate's
meaning the brief lists (`TEST_DIR_NAME` in `src/watcher/verify.ts`,
`isTestFilePath` in `src/core/spec/linter.ts`, and `isTestPath` in
`src/core/spec/test-impact.ts` and `src/core/spec/digest.ts`), two more
places test for `tests/` by hand. The git guard's `isNewUntrackedTest` in
`src/watcher/git-guard.ts` lets an agent add a new untracked test file
outside its scope. `scopedStatusPaths` in `src/core/run/task-commit.ts` puts
new untracked test files into the task's commit. Both are the gate's meaning:
new files under `tests/` are always allowed. This change covers all six.

**One edge case.** Those two used `startsWith('tests/')`, and
`isGatedTestPath` also accepts `tests` itself. The results differ only for a
regular file named `tests` at the project root. That file cannot exist next to
the `tests/` folder the gate snapshots, and git status lists untracked files
one by one, never as a bare folder ("Status" in version-control). No test or
output changes.

**Measured fallout.** A rough version of both tasks ran in a scratch worktree
on 2026-09-29: both typechecks, the build, lint, and all 2,732 tests passed,
the line and function budgets included. No existing test changes, so no task
sets `tests.modify`. `linter.ts` and `show.ts` stay on the line-budget allow
list, and no grandfathered function shrinks: the removed helpers were separate
functions.

**Where the gate's function lives.** `src/core/run/test-gate.ts`, owned by
watcher-and-harness. The watcher and `src/core/run/task-commit.ts` are there
already, and `src/core/spec/test-impact.ts` already imports from
`src/core/run/`, so spec lint can use it without a new direction of import.

**The removed requirement.** cli-foundation's "Test gating configuration"
says the configuration loader defines test file patterns defaulting to
`tests/**`. No such key exists in `OsqConfig`, `DEFAULT_CONFIG`, README, or the
templates; the gate was always hardcoded. A MODIFIED requirement has to keep
its scenario, which names `osq.config.ts` patterns, so the requirement is
removed, and watcher-and-harness adds "Test gate paths", which says what is
true.

## Contract

### Requirement: One function per meaning
Each meaning of "test path" SHALL have one definition, and every consumer
SHALL call it.

#### Scenario: A test file outside tests
- **WHEN** a task's scope holds `src/quote.test.ts`
- **THEN** traceability counts it as a test path, and the frozen-test gate does not govern it

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: adds "Test gate paths".
- `specs/traceability/spec.md`: modifies "Test paths".
- `specs/spec-lint-and-approve/spec.md`: modifies "Test modification declaration validation", naming the gate's function and adding "Named test outside tests".
- `specs/status-inspection/spec.md`: modifies "Scenarios in show", naming traceability's meaning.
- `specs/cli-foundation/spec.md`: removes "Test gating configuration".

The two defining requirements list every consumer, and the consumers'
requirements in spec-lint-and-approve and status-inspection point back to
them, so either side says which meaning applies.

Two tasks. Task 1 adds `src/core/run/test-gate.ts` and moves the six
consumers of the gate's meaning onto it. Task 2 moves `osq show` onto
traceability's `isTestPath`.

No file is shared between tasks.
