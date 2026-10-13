---
status: accepted
applies_to: [watcher-and-harness, cli-foundation]
rule: With autoSteer on, the watcher runs one planner per run steering trigger; it writes only the change folder, osq lints the plan, and a human approves.
---
# 018. Steering planner

Date: 2026-10-13

## Status

Accepted

## Context

ADR 006 decision 5 ends every steering trigger the same way: osq records the
reason and its evidence and offers one action, plan it. Today that action is a
shell step. A human runs `osq plan <id>`, a planner session revises the plan in
the change's worktree, and the human approves. The approve tap works from a
phone; the planning step does not.

Most run triggers need less than a session. An executor that reports `blocked`
usually names what it lacks: a file outside its scope, a missing acceptance
line, a test it may not change. Change 183 makes more plan misses end as
`blocked`. The planner can read that need, revise the plan, and lint it without
a human at the keyboard, and the human still decides whether the revision
runs.

Two accepted decisions stand in the way. ADR 006 rejects "Headless AI planning
now", because planning is where the human steers. ADR 007 says a planner osq
runs is not a role yet and keeps osq's whole environment. Running a planner
from the watcher needs both settled.

## Decision

1. **Off by default.** A project turns it on with `autoSteer.enabled` in
   `osq.config.ts`. Without it, every trigger waits for `osq plan <id>` as
   before.
2. **Run triggers only.** The watcher starts the planner for an active change
   whose triggers are `stuck`, `blocked`, or a `regression` that is not
   `sync_verify_red`. A change with any default-branch trigger waits for a
   human, because its revision depends on what the default branch did.
3. **One run per trigger.** osq keys a run by the change's approval hash and
   its current triggers with their marker contents, and records the outcome in
   `.run/auto-steer.md`. A record with the current key, whatever its outcome,
   means no second run. A new approval or a new trigger makes a new key.
4. **The same prompt as `osq plan <id>`.** The planner gets exactly the prompt
   `osq plan <id> --print` prints, in the change's own tree, on the planner's
   harness and model as `osq plan --session` resolves them.
5. **Its environment.** The agent role's allowlist from ADR 007, built for the
   planner's harness, as ADR 010 gives the validator. A planner role block
   comes with a later confinement stage.
6. **What it may write.** Only the change folder, outside `.run/`. osq records
   the tree before the spawn and puts back every other path the planner
   changed, as the validator guard does. Its harness events go to
   `.run/events/planner.jsonl`.
7. **osq checks its work.** After the planner exits, osq lists the plan files
   that changed and lints the change itself. Only a run that changed the plan
   and left lint green is `ready`. `failed`, `timed_out`, `unchanged`, and
   `lint_red` leave the trigger as it was, with the planner's edits kept for
   the human's own session, and the inbox says which.
8. **A human approves.** A `ready` plan turns the change's inbox item into an
   approve tap that lists the changed files. The planner never approves, and
   approval works exactly as for a plan a human steered.

## Consequences for ADR 006 and ADR 007

- ADR 006's rejection of headless planning stays for new changes: the queue
  is still planned by a human. For a run trigger, the first revision may come
  from the watcher, and the human steers by approving it or by running
  `osq plan <id>`.
- ADR 007's planner stage is not reached. The steering planner gets the agent
  role's environment; an interactive `osq plan` session still keeps osq's.

## Consequences

- A run trigger costs up to `autoSteer.timeoutSeconds` (1800 by default) of
  watcher time and one planner run. The watcher handles no other change while
  it runs.
- A planner that changes nothing, fails, or leaves lint red costs a run and
  leaves the change where it was.
- The planner's harness must be set up in the change's tree as the executor's
  is; with a different planner harness, `osq doctor` is the place to check it.

## Rejected

- **Running it for default-branch triggers.** A conflict or a changed
  requirement needs a merge or a restart decided on the default branch; the
  brief leaves them to a human.
- **Retrying a failed run.** Two runs on the same evidence mostly repeat the
  first; a human looks instead.
- **Letting the planner approve.** Approval is the human's tap (ADR 006).
- **Putting failed edits back.** A lint-red plan is often nearly right, and the
  human's session starts from it.
- **Planning queue items automatically.** A new plan is where the human
  steers most; that stays a session.
