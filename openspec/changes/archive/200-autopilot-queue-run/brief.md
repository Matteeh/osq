---
queue_item: autopilot-queue-run
queue_hash: sha256:74f025665b0322969d91756f2ebc798885b948a40b878e587837ec9ca69991d9
planner: null
date: 2026-10-15
---

### Goal

After `osq queue approve`, the watcher works through the queue by itself: it plans the next item headless, approves the plan when lint is green, runs it, lands it, and takes the next item. A human who walks away comes back to a landed queue.

### Context

As of 2026-10-15:

- `osq plan --next` creates the next item's change folder; `osq plan --run` (194, ADR 019) runs a planner detached and records it in `.run/plan-run.md` (`src/core/run/plan-run-record.ts`).
- `osq approve`, `osq land` and `vcs.afterLand` exist as CLI command functions that the server already calls (ADR 014).
- Planned items carry `queue_hash`; `osq queue` lists each item's state.

### Requirements

- `osq queue approve` records the human's approval of the whole queue with a hash per item. `osq queue` shows it. Editing or adding an item leaves that item unapproved until the next `osq queue approve`.
- A config block, for example `autopilot: { enabled }`, off by default.
- With autopilot on and no active change, the watcher takes the first approved, unplanned item whose `Depends on` items have landed, plans it with the headless planner, lints it, and approves it through the same code as `osq approve`, recording that autopilot approved it under the queue approval. A plan that is unchanged or lint red after the planner run stops the queue.
- After archive the watcher lands the change through the same code as `osq land`, then takes the next item.
- Every stop writes one record the inbox, `osq status` and the dashboard show, with the reason and the one command that resumes it.
- Turning autopilot off, or a human running any command on the active change, leaves the queue where it is without losing state; the watcher survives a restart mid-queue.

### Non-goals

- Recovery after a halted run; that is `autopilot-recovery`.
- Notifications beyond the inbox.

### Notes for planning

- Reuse the command functions; autopilot must not grow its own approve or land path.
- Prove the loop end to end with the mock harness over a fixture queue of three items, the way the recovery tests in 172 do.
