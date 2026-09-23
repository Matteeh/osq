---
title: A verify must find every file it names
depends_on: ["066"]
verify: pnpm verify
features:
  reads:
    - watcher-and-harness
    - spec-lint-and-approve
    - metrics-and-reporting
    - status-inspection
    - cli-foundation
---
## Goal

A task passes only if every file its verify names exists when the verify runs.
Today `node --test a.test.ts b.test.ts` exits 0 when `b.test.ts` does not
exist, so a task whose verify names the new test it is supposed to add passes
even if the agent never writes that test.

After the agent exits, the watcher checks every path the task verify names and
kills the task with `verify_path_missing` when one is missing. Before spawn, the
red check records which named paths do not exist yet, so a verify that is green
only because its new test is not written is not a mismatch. Lint warns, and the
approval digest flags `verify_starts_conflict`, when a task declares
`verify_starts: green` or `any` while its verify names a test the task itself
creates. Lint also warns when a verify names a missing path that no task in the
change could create.

Evidence: 062 was the first change run with the pre-spawn check. All nine tasks
started green because every verify named a new test file next to existing ones.
Task 3 of 064 did the same. In 066 both tasks declared `verify_starts: any`
although each verify named a test the task creates, which silenced the check.
In 065 every verify named only its new test and started red with "Could not
find", which is the honest shape.

Named paths: operands of the verify command that are not options, not absolute,
not `KEY=value` assignments or URLs, not a bare first token, and contain a path
separator. So `--import tsx` and `pnpm verify` name nothing, while
`tests/a.test.ts` is named. An operand with `*` or `?` is a glob and is present
when it matches at least one file. The tokenizer and the operand rules that lint
uses today (`tokenizeVerifyCommand` and `namesExistingRepositoryPath` in
`src/core/spec/linter.ts`) move into one shared module, and lint, the digest,
and the watcher all use it.

A task contradicts itself when its verify names a path that is missing at lint
or digest time, the path is not covered by the scope of any earlier task, it is
covered by the task's own scope, and the task declares `green` or `any`. A path
is covered by a scope when it equals an exact scope entry or matches a scope
glob; a glob operand is covered only by an identical scope entry.

File budgets shape the tasks. `runner.ts`, `verify.ts`, and `outcome.ts` are
197, 198, and 199 lines against the strict under-200 budget in
`tests/import-graph.test.ts`, so the post-spawn check lives in `task-verify.ts`
and the failure-reason union moves to a new module. `archiver.ts` is 249 lines,
so its verify step moves to a new module. `report-events.ts` is 248 lines, so
the new pre-spawn counts get their own module. `linter.ts` is allow-listed at
1,108 lines and must end shorter than that.

Measured in a scratch worktree: a rough version of every surface change (flag id,
report fields, retry reason, lint warnings, post-spawn and archive checks,
PLANNER and README text) breaks only `tests/report-approval-flags.test.ts`,
`tests/report-json.test.ts`, and `fixture/report/expected.json`. Those belong to
task 5. Task 4 adds the flag id to the `ApprovalFlagId` union only; the report's
`FLAG_IDS` list waits for task 5, which keeps every task green on its own.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New offline tests prove that:
a runner task whose verify names one existing and one missing test, with a fake
agent that writes only the result file, dies with `verify_path_missing` naming
the missing file, and reaches done when the agent also writes it; a
`verify_path_missing` death is retried automatically once with the missing path
in the next prompt; a pre-spawn run with a missing named file and a passing
command records `missingPaths` and `mismatch: false`; archive verification
regresses on a missing named path without running the command; commands that
name no paths behave as today; quoted operands, options, assignments, and URLs
are never paths and an unmatched glob counts as missing; lint and the digest
report the contradiction for `green` and `any` but not for `red` or for a path an
earlier task creates; lint warns for a path no task can create; and `osq report`
and `osq show` print the new pre-spawn counts, the missing paths, and the new
flag.

## Non-goals

- Checking that a named test file contains tests or exercises the scope
  (roadmap item 2.4).
- Parsing each test runner's own options. The check reads operands only.
- Making `verify_starts_conflict` block approval.
- Rewriting archived events or reclassifying 062, 064, or 066.
- Applying the missing-path check to scope-audit verification.

## Surface

- Added: `verify_path_missing` (dead reason, eligible for automatic retry; also the regressed marker reason at archive time)
- Added: `missingPaths` (field on pre-spawn `verify_ran` events, present only when a named path is missing)
- Added: `history.preSpawnVerify.missingPathRuns` and `history.preSpawnVerify.byStart` in `osq report --json`, with `Pre-spawn verify with missing paths:` and `Pre-spawn verify by declared start:` text lines
- Changed: `osq show` pre-spawn line appends `missing <paths>` when a run recorded missing paths
- Added: `verify_starts_conflict` (approval flag)
- Added: two `osq lint` warnings, one for a task that creates a test its verify names while declaring `green` or `any`, one for a verify naming a path no task can create
- Changed: `PLANNER.md` managed block guidance on `verify_starts`

## Contract

### Requirement: Verify path check
After the agent exits and before the task verify runs, the watcher SHALL kill
the task with `verify_path_missing` when any path the verify names is missing,
without running the command.

#### Scenario: New test never written
- **WHEN** a verify names `tests/old.test.ts` and `tests/new.test.ts` and the agent writes only its result file
- **THEN** the task dies with `verify_path_missing` naming `tests/new.test.ts`, though the command alone would exit 0

### Requirement: Verify start contradiction
Lint SHALL warn and the digest SHALL flag `verify_starts_conflict` when a task
declares `green` or `any` while its verify names a missing path that its own
scope creates and no earlier task's scope creates.

#### Scenario: The 066 shape
- **WHEN** a task declares `verify_starts: any` and its verify names a missing test inside its own scope next to an existing test
- **THEN** lint warns and the digest raises `verify_starts_conflict`

## Human steps

- Review the proposal, delta specs, and task bodies, then run `osq approve 067`
  yourself. Task 7 has `PLANNER.md` in scope, so the digest shows a
  `sensitive_path` flag for it.

## Delta

- `specs/watcher-and-harness/spec.md`: adds "Verify path check"; modifies
  "Pre-spawn verify event and mismatch handling", "Automatic retry", and
  "Archive-time verification re-run".
- `specs/spec-lint-and-approve/spec.md`: adds "Verify start contradiction";
  modifies "Verify-command trust validation" and "Approval flags".
- `specs/metrics-and-reporting/spec.md`: modifies "Execution history".
- `specs/status-inspection/spec.md`: modifies "Detailed specification
  inspection".
- `specs/cli-foundation/spec.md`: adds "Planner verify start guidance".

No file is shared between tasks.
