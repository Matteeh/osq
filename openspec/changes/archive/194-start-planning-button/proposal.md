---
title: The Change page starts the planner on the server, and shows that it is working
depends_on: ["192"]
verify: pnpm verify
features:
  reads:
    - metrics-and-reporting
    - version-control
---
## Goal

On the phone today, planning a change means copying the hand-off block and
pasting it into a Claude Code Remote Control session on the server. With this
change, the hand-off block on the Change page gets a `Start planning` button
for an unplanned change, for Plan again before approval, and for Plan it on a
halted change. A tap starts the planner on the machine that serves the page,
in that machine's own tree, with its own harness login. The human never leaves
the osq page.

The tap runs `osq plan <id> --run`, the same command a shell can run. It starts
a detached osq process and returns at once. That process runs the planner the
way change 189's steering planner runs: the agent role's environment, osq
checks what it wrote, lints the plan, and records the outcome. A change that
needs steering is planned in place in its own osq worktree, exactly as 189
does. A change folder in the checkout is planned in a scratch worktree, and osq
copies back only the plan files, so nothing else in the checkout is touched.
This works the same in local `osq serve` and on the server.

While it runs, the change's next step reads
`planning (since <time>) — osq show <id>`, `osq approve` waits, and the Change
page shows `Planning on server · <n> min` instead of the hand-off block. When
the plan lints clean, the page moves to Approve. Any other outcome shows one
line saying what happened, above the hand-off block, which stays the fallback.

ADR 019 records the decision first. ADR 006 rejected headless planning, ADR
018 allowed it only for run triggers, and ADR 014 said no planner runs on the
server yet.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test and lint on the final tree. That
includes the new `tests/tapped-planner-adr.test.ts`,
`tests/plan-run-record.test.ts`, `tests/auto-steer-live.test.ts`,
`tests/plan-run-status.test.ts`, `tests/plan-run-command.test.ts`,
`tests/plan-run-worker.test.ts`, `tests/plan-run-approve.test.ts`,
`tests/plan-run-remote.test.ts` and `tests/ui-start-planning.test.tsx`, and the
function and line budget tests over the new and changed modules.

## Non-goals

- Live steering comments to a running planner.
- Keeping AI credentials in osq. The planner uses the harness login of the
  machine it runs on, as executors do.
- Planning in the cloud.
- Starting a planner for an archived change, including Plan again on an
  archived change and an archived change that needs steering. Those keep the
  hand-off block.
- The Plan again notes sheet. The `plan` action and `osq plan --run` take
  notes, but the page sends none until that screen exists.
- Showing a running planner in `osq inbox` or on the dashboard's home rows.
- An event for a run on a checkout change, or a query table of planner runs.
- Starting a planner without version control. `--run` needs `vcs.enabled`.

## Surface

- Added: `osq plan <id> --run` (flag): starts a detached planner for the change and returns
- Added: `osq plan <id> --run --notes <text>` (flag): the human's notes, added to the prompt
- Added: `plan` (dashboard action verb), body `{"verb":"plan"}` or `{"verb":"plan","notes":"<text>"}`
- Added: `Start planning` (Change page button in the hand-off block)
- Added: `planning` (next step state) with detail `since <time>` and command `osq show <id>`
- Added: `.run/plan-run.md` (marker osq writes in a checkout change folder)
- Added: `.run/logs/plan-run.log` (the detached planner process's output)
- Added: `<vcs.worktreeRoot>/<repo>/.planning/<folder>` (scratch planning worktree, removed after each run)
- Changed: `.run/auto-steer.md` gains `pid`, the process running the planner, while `running`
- Added: change document field `planRun: { outcome, startedAt, detail }`
- Added: ADR 019, `decisions/019-tapped-planner.md` (document)

## Decisions

- ADR 001: no config key is added; the run reads `autoSteer.timeoutSeconds` and the planner selection through the existing loader.
- ADR 002: archive and delta application are not touched.
- ADR 004: the OpenSpec validator is not touched; lint runs as `osq approve` runs it.
- ADR 005: the OpenSpec peer range is not touched.
- ADR 010: the planner spawns through `adapter.spawn` with a `prompt`, as the validator and ADR 018's planner do; the validator does not change.
- ADR 012: the planner runs in its own detached process, so the watch service and the server worker restart on a new build without stopping it, and the watcher never waits for it.
- ADR 013: the `plan` verb goes through the same host, origin, content-type and token checks and the one-action-at-a-time gate as every other write; the action returns as soon as the planner process has started.
- ADR 015: `osq mcp` is not touched; no MCP tool starts a planner.
- ADR 018: an automatic run is unchanged, except that its `running` record carries the watcher's pid and the watcher leaves alone a `running` record whose process is alive.
- Departs from ADR 014: decision 7 says no planner role runs on the server yet. ADR 019 runs a planner a human starts on the server's own clone, through the same command function as the CLI.

Task 1 adds ADR 019, which governs tasks 2 to 7.

## Assumptions

- 189's steering planner has never run for real in this repository: `autoSteer` is off and no `.run/auto-steer.md` exists anywhere. The user chose on 2026-10-14 to plan now and treat the first tapped runs as the trial.
- The user wants local `osq serve` and the server to behave the same (2026-10-14). That is why a checkout change plans in a scratch worktree: planning in place with 189's tree guard would put back a human's own edits outside the change folder in a local checkout.
- The scratch worktree is checked out at the checkout's HEAD, detached, and gets `vcs.prepare`. A planner that writes the real checkout by absolute path is not caught, the same trust an executor in its worktree has.
- A human who edits the change folder by hand while a planner runs for it loses those edits to files the planner also changed.
- `isProcessAlive(pid)` tells a live planner from one whose process died. A reused pid would read as alive until that process ends.
- The planning line's minutes come from the record's start time and the page's clock, so they move without a new change document.
- Measured on 2026-10-14 in a scratch tree with the type changes (a `planning` state, a `plan` verb, a `planRun` field, the record `pid`): both typechecks failed only in `tests/serve-actions.test.ts`, `packages/ui/src/change/page-model.ts` and `packages/ui/src/change/useChangeActions.ts`, and the suite failed only `tests/web-actions.test.ts` (two cases) and the line budget on `src/core/web/web-write.ts`. Each is in the scope of the task that causes it.

## Contract

The cli-foundation, watcher-and-harness, status-inspection, web-inspection and
spec-lint-and-approve deltas below are the contract.

## Human steps

### Before approval

None

### After landing

- Try `Start planning` on an unplanned change from the phone, then on a halted one.
- Update the Notion roadmap and the "Server UI screens" page: Start planning landed, with ADR 019.

## Delta

- `specs/cli-foundation/spec.md`: ADDED "Tapped planner decision" (task 1), "Planner run command" and "Planner run process" (task 4), "Planner run on a server" (task 6).
- `specs/watcher-and-harness/spec.md`: ADDED "Planner run record", MODIFIED "Automatic steering record" (task 2).
- `specs/status-inspection/spec.md`: ADDED "Planning next step" and "Planner start eligibility" (task 3).
- `specs/web-inspection/spec.md`: ADDED "Change documents carry the planner run", MODIFIED "Change page model" (task 3); MODIFIED "Loopback write actions" (task 5); MODIFIED "Change page hand-off", ADDED "Change page while planning" (task 7).
- `specs/spec-lint-and-approve/spec.md`: ADDED "Approve waits for a running planner" (task 6).

Every file belongs to one task. Task 2 moves `spawnPlanner`, `decideOutcome`
and `RunContext` out of `src/watcher/auto-steer-run.ts` into the new
`src/watcher/planner-spawn.ts`; task 4 imports them from there. Task 3's
`canStartPlanner` is read by tasks 4 and 5, and task 3's `planningLine` and
`planRunLine` by task 7, without editing task 3's files. Task 5's `plan`
action is what task 7's button runs.
