---
title: A task whose prompt names a missing file stops before the executor starts
depends_on: []
verify: pnpm verify
features:
  reads: [version-control, cli-foundation, metrics-and-reporting]
---
## Goal

A task's `entry` lists the files its executor reads first, and nothing checks
that they exist. When a plan names a file that a refactor removed, or one that
exists only in the planner's checkout, the executor spends an attempt working
around it. 163 task 2 named helpers 162 had removed; the executor wrote
private copies and reported it under `## Missing context`. 156 task 1 named
`fixture/report/.osq/.gitignore`, an ignored file that a fresh worktree does
not have.

With this change, `osq lint` reports an `entry` path that neither the default
branch nor the change can provide, so the planner fixes it before approval.
At run time the watcher checks every entry in the worktree before it spawns
the executor. A missing one ends the task as `entry_missing`, a steering
trigger like `blocked`: no executor attempt, the inbox names the files and
`osq plan <id>`, and approving the revised plan resumes the run.

Measured on 2026-10-11 against the 72 archived changes that have an approval
commit (1,143 entries). An entry the task's own `scope` covers must count as
present, because planners list files a task creates: 130 tasks 2 to 4 and 145
task 1 did, and they passed. With that rule the lint finds exactly one entry,
156's ignored file. `entry` holds no globs in any archived task, but the
parser accepts them, so a pattern counts as present when it matches a file.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test (the new entry-check, inbox
and lint tests, plus the runner, steering, inbox and lint tests that pin
today's behavior), and lint, on the final tree.

## Non-goals

- Checking function or export names inside an entry file.
- Checking `scope`, which may name files a task creates.
- Checking entries of tasks that are already done or running.
- Retrying `entry_missing` automatically; the plan has to change.

## Surface

- Added: dead reason `entry_missing`, a `blocked` steering trigger.
- Added: `osq lint` error `Task <n> entry names <path>, which is not in <default branch> and no task up to this one creates`.
- Changed: a `task-dead` inbox item for `entry_missing` carries `blocked: { need: "missing entry files <paths>" }` and the command `osq plan <id>`.

## Decisions

- ADR 002: unchanged; no delta application changes.
- ADR 004: unchanged; the new lint rule runs beside the OpenSpec validator, not inside it.
- ADR 005: unchanged; no validator version check is touched.
- ADR 010: unchanged; an `entry_missing` task never spawns, so the validator never sees it.
- ADR 012: unchanged; the watch service runs the same runner.

## Assumptions

- The lint rule is an error, not a warning. Over the archive it found one entry, a real miss, and the watcher would halt that task anyway, so failing at lint is the cheaper stop.
- A stacked change may name a file its dependency creates. The lint accepts any file that an approved or archived, unlanded change's task scope covers, rather than computing the exact stack base.
- `tests/import-graph.test.ts` keeps `src/watcher/runner.ts` under 200 lines, and it has 199. Task 1 moves the task-file read into a new helper so the check fits; measured at 193 lines.

## Contract

The watcher-and-harness, status-inspection and spec-lint-and-approve deltas
below are the contract.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: ADDED "Entry path check before spawn".
- `specs/status-inspection/spec.md`: MODIFIED "Steering triggers", "Blocked inbox items".
- `specs/spec-lint-and-approve/spec.md`: ADDED "Entry paths exist".

Task 3 imports `src/core/run/entry-paths.ts`, which task 1 owns, without
editing it.

Shared file: `tests/entry-missing-run.test.ts`, owned by task 1 and extended
by task 3. Task 3's lint rejects the approvals those tests make with a missing
entry, so task 3 rewrites them to commit the file on main, approve, and then
remove it in the worktree.
