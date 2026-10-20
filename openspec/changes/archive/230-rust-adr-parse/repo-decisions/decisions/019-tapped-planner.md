---
status: accepted
applies_to: [cli-foundation, watcher-and-harness, web-inspection]
rule: A planner a human starts with a tap or osq plan --run runs detached, as ADR 018 runs one; it writes only the change folder, and a human approves.
---
# 019. Tapped planner

Date: 2026-10-14

## Status

Accepted

## Context

On a phone, planning a change still means copying the hand-off block and
pasting it into an agent session on the server. ADR 018 lets the watcher run a
planner without a human, but only for a run steering trigger. A human who
wants a plan for a new change, or wants to plan a halted change now, has no
tap for it.

Three accepted decisions stand in the way. ADR 006 rejects "Headless AI
planning now" and says it may come back through the app. ADR 018 rejects
"Planning queue items automatically". ADR 014 decision 7 says no planner role
runs on the server yet.

A planner run takes up to `autoSteer.timeoutSeconds`, 1800 seconds by default.
The server allows one action at a time and restarts itself on a new build, and
the watcher runs one change at a time. None of them can wait for a planner.

## Decision

1. **A human starts it.** `osq plan <id> --run` starts a planner for one
   change. The dashboard's `Start planning` button runs the same command
   function through a `plan` action. Nothing starts it without a human; ADR
   018's automatic run stays as it is.
2. **Which changes.** An active change whose next step is `unplanned` or
   `ready-for-approval`, or `dead` because it needs steering. Archived changes
   keep the hand-off block. It needs `vcs.enabled`.
3. **It runs detached.** The command spawns a detached osq process, writes a
   `running` record holding that process's pid, and returns. The server and
   the watcher restart without stopping it, and the watcher keeps running
   tasks. A `running` record whose process is gone reads as interrupted.
4. **The prompt `osq plan` builds.** For a change that needs steering, the
   prompt `osq plan <id> --print` prints. For any other change,
   `plan-prompt.md` as `osq plan <id>` writes it. Notes the human gives follow
   under `## Notes from the human`.
5. **Its environment and harness.** As ADR 018 decision 5: the agent role's
   allowlist from ADR 007, on the planner's harness and model as
   `osq plan --session` resolves them.
6. **Where it writes.** A change that needs steering is planned in place in
   its own osq worktree, exactly as ADR 018 decision 6 says, with its record
   in `.run/auto-steer.md`. A change folder in the checkout is planned in a
   scratch worktree at the checkout's HEAD, under
   `<vcs.worktreeRoot>/<repo>/.planning/<folder>`, after `vcs.prepare`. osq
   copies back only the plan files, records the run in `.run/plan-run.md`,
   and removes the scratch tree. Nothing else in the checkout changes, so a
   human's own edits there are safe, and local `osq serve` and the server
   behave the same.
7. **osq checks its work.** As ADR 018 decision 7: osq lists the plan files
   that changed and lints the change itself, and the outcome is `ready`,
   `unchanged`, `lint_red`, `failed` or `timed_out`. The edits stay whatever
   the outcome.
8. **One at a time, and approval waits.** A second start for the same change
   refuses while a planner runs for it, and so does `osq approve`.
9. **A human approves.** The planner never approves. A `ready` plan is
   approved exactly as a plan a human wrote.

## Consequences for ADR 006, ADR 014 and ADR 018

- ADR 006's headless planning comes back through the app, as ADR 006
  foresaw. The human still steers: they choose when it runs, read the plan,
  and approve it or plan by hand.
- ADR 014 decision 7 no longer holds for a planner a human starts: the server
  runs it on its own clone through the same command function as the CLI.
  Planners outside the server keep using the CLI or MCP.
- ADR 018 keeps its rules for automatic runs. Its `running` record now carries
  the pid of the process running the planner, and the watcher leaves alone a
  `running` record whose process is alive.

## Consequences

- A tap costs one planner run, up to `autoSteer.timeoutSeconds`, on the
  machine that serves the page.
- A scratch run adds a worktree checkout and `vcs.prepare` before the planner
  starts.
- A planner that writes the real checkout by absolute path is not caught, as
  an executor that writes outside its worktree is not.

## Rejected

- **Running the planner inside the server process.** It would hold the
  one-action slot for up to half an hour and die on every new build.
- **Running it in the watcher.** No task on any change would run while it
  plans.
- **Planning in place in the checkout.** ADR 018's guard puts back every path
  that changed outside the change folder, including a human's own edits.
- **A Start planning button only on the server.** Local and server would
  behave differently for the same tap.
- **Live steering of a running planner.** It needs a channel into the
  harness session; notes before the start come first.
