---
title: After a blocked task, osq starts the planner on the steering prompt and the human only approves
depends_on: []
verify: pnpm verify
features:
  reads:
    - metrics-and-reporting
    - spec-lint-and-approve
    - version-control
---
## Goal

When a task dies `blocked`, or another run trigger asks for steering, the
human today has to open a shell and run `osq plan <id>` before anything moves.
With this change, a project that turns on `autoSteer` lets the watcher start
the planner by itself. The watcher runs it once per trigger, headless, in the
change's own tree, on the exact prompt `osq plan <id>` builds. osq puts back
anything the planner wrote outside the change folder, lists the plan files it
changed, and lints the plan itself. A plan that changed and lints clean turns
the inbox item into an approve tap with the changed files listed. The tap works
from `osq inbox`, the dashboard, or a phone. Any other outcome leaves the
trigger as it is today, and the inbox names the outcome next to `osq plan <id>`.
The planner never approves.

ADR 018 records the decision first, because ADR 006 rejected headless planning
and ADR 007 said a planner is not a role yet.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test and lint on the final tree. That
includes the new `tests/steering-planner-adr.test.ts`,
`tests/auto-steer-config.test.ts`, `tests/auto-steer-run.test.ts`,
`tests/auto-steer-inbox.test.ts` and `tests/steering-prompt.test.ts`, and the
function and line budget tests over the new modules.

## Non-goals

- Planning new changes from the queue automatically.
- Steering triggers that need the default branch (`conflict`,
  `requirement_changed`, and a `sync_verify_red` regression), and archived
  changes that need steering.
- A second automatic run for the same trigger, or a retry of a failed run.
- A `planner` confinement role block; the planner gets the agent role's
  allowlist, as the validator does.
- Listing the changed files on the dashboard's home row. The row shows
  `osq approve <id>` and the change page offers Approve; the list is in the
  inbox JSON and in `osq inbox`.
- Turning the setting on in osq's own `osq.config.ts`.

## Surface

- Added: `autoSteer.enabled` and `autoSteer.timeoutSeconds` (config keys, defaults `false` and `1800`)
- Added: `.run/auto-steer.md` (marker file the watcher writes in a change folder)
- Added: `auto_steer_ran` (change-level event type)
- Added: `.run/events/planner.jsonl` (the steering planner's harness events)
- Added: inbox needs-you field `autoSteer: { outcome, changed }` and dispatch item field `autoSteer`
- Changed: a steering item whose automatic plan is ready has command `osq approve <id>`, text `revised plan ready after <trigger> (<reason>): changed <files>`, and next step detail `revised plan ready`
- Added: ADR 018, `decisions/018-steering-planner.md` (document)

## Decisions

- ADR 001: the `autoSteer` block loads through the existing config loader.
- ADR 002: archive and delta application are not touched.
- ADR 004: the OpenSpec validator is not touched; lint runs as `osq approve` runs it.
- ADR 005: the OpenSpec peer range is not touched.
- ADR 010: the steering planner reuses the validator's tree guard and its way of spawning a role through `adapter.spawn` with a `prompt`; the validator's own behavior does not change.
- ADR 012: the planner runs inside a watcher pass, so the watch service never restarts mid-run.
- ADR 015: `osq mcp` is not touched.

Task 1 adds the steering planner ADR, which governs tasks 2 to 5: off by
default, run triggers only, one run per trigger key, the `osq plan <id>`
prompt, the agent role's environment for the planner's harness, writes only
the change folder outside `.run/`, osq lints, and a human approves.

## Assumptions

- "What changed since the last approval" is the list of plan files the planner changed. Nobody else edits the folder of a change that waits for steering, so the files before the run are the approved plan.
- The planner keeps its edits whatever the outcome, decided with the user on 2026-10-13: a lint-red plan is often nearly right, and the human's `osq plan <id>` session starts from it.
- The planner runs through each harness's ordinary noninteractive `spawn`, with the planner's harness, model and agent from `resolvePlannerSelection`, as `osq plan --session` picks them. That harness must already be set up in the tree, as for the validator.
- The planner blocks the watcher for up to `autoSteer.timeoutSeconds`. With `maxConcurrency: 1` no other change runs meanwhile anyway.
- The tree guard compares `vcs.status()` before and after, so a human editing a file outside the change folder in the same tree during the run would see that edit put back. Worktree changes make this unlikely.
- Measured on 2026-10-13 in a scratch tree with a rough version of all five tasks: both typechecks, the build and the suite passed (3961 tests) except the function budget on the rough `runAutoSteer`, which task 3 splits. A rough end-to-end run gave `ready`, put back an outside file and a forged `.run/approved`, offered `osq approve 001` in the inbox and dispatch, ran no second planner, and ran task 2 after the approval.

## Contract

The cli-foundation, watcher-and-harness and status-inspection deltas below are
the contract.

## Human steps

### Before approval

None

### After landing

- To try it on osq itself, add `autoSteer: { enabled: true }` to `osq.config.ts` and restart the watcher.
- Update the Notion roadmap and "Making osq bulletproof" candidate 6 with ADR 018.

## Delta

- `specs/cli-foundation/spec.md`: ADDED "Steering planner decision" (task 1), "Automatic steering configuration" (task 2), "Steering prompt for the watcher" (task 5).
- `specs/watcher-and-harness/spec.md`: ADDED "Automatic steering run", "Automatic steering record" (task 3).
- `specs/status-inspection/spec.md`: ADDED "Revised plan from the automatic planner" (task 4).

Every file belongs to one task. Task 4 reads `currentAutoSteer`, `steeringKey`
and `writeAutoSteerRecord` from task 3's `src/core/run/auto-steer-record.ts`,
and task 5 passes `steeringPrompt` to the `startWatcher` option task 3 adds,
without editing task 3's files.
