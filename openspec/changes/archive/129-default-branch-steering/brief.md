---
queue_item: default-branch-steering
queue_hash: sha256:8bd4ffd636d509b4988df36b8ac3652665bf28724f7b1f98d3d63f5e22b12cf1
planner: null
date: 2026-10-01
---

### Goal

The triggers of ADR 006 decision 5 that involve the default branch end the way the run triggers do after `steering-triggers`: one inbox item, `osq plan <id>`, a revised plan approved where the change runs, and the run continues. That includes an archived change that halted at land, which today has no way out inside osq.

### Context

As of 2026-10-01, with `steering-triggers` (128) planned:

- 128 made a stuck task, a blocked task, and a regression steering triggers. `deriveSteering` in `src/core/status/steering.ts` reads them from markers, the watcher skips a change that needs steering, `osq plan <id>` writes the prompt with the evidence into the change's own folder, and `approveSteeredChange` in `src/core/spec/approve-steer.ts` seals and commits the revised plan in the worktree and retires each trigger through `retrySpec`.
- A sync before a change's first task or before archive halts it with `.run/regressed/change.md`, reason `sync_conflict` or `sync_failed`. `assertRequirementsUnchanged` in `src/core/vcs/sync-specs.ts` stops with `sync_failed` too, and its message says to reject and plan again. `osq sync` on an active change only appends `sync_stopped`.
- `osq land` of an archived change that conflicts, has a red verify or check after merging, or finds a changed requirement, aborts the merge and prints the stop. Nothing is recorded, `osq reject` refuses archived changes, and the watcher no longer runs the change. On 2026-09-29 a human fixed 112 by hand in its worktree.
- Replanning tasks cannot fix a code conflict alone: the branch still lacks the default branch's conflicting commit, so the next sync conflicts again. Found while planning 128.
- `.run/base` is the commit the branch was cut from; `assertRequirementsUnchanged` compares the change's rewritten requirements between it and the default branch's tip.

### Requirements

- A requirement the change rewrites that changed on the default branch, a code conflict at sync or land, and a red verify or check at sync or land are steering triggers, added to the status-inspection "Steering triggers" list. The requirement check stops with its own reason, not `sync_failed`.
- A land that stops on an archived change records the trigger and its evidence where `osq plan <id>` and the inbox find it.
- An archived change that halted can be planned and run again: approving its revised plan puts it back on its branch as an active change, with the living specs as the default branch has them and done tasks still done, and the run continues.
- A revised plan for a changed requirement is judged against the default branch's current text, so the next sync does not stop on the same requirement again.
- After a code conflict, approving the revised plan leaves the branch holding the default branch, whether through a merge the revised plan resolves or a restart from the default branch. Decide which before planning.

### Decide before planning

- For a code conflict: restart the change from the default branch with every task run again, or merge with the conflict resolved by a task.
- Where a land's stop is recorded for an archived change, given that land runs from the checkout and the archive folder lives on the branch.

### Non-goals

- An AI resolver for code conflicts. It waits until sync data shows conflicts are common and mechanical.
- The UI action and notifications.

### Notes for planning

- Read 128's proposal and `approve-steer.ts` first; build on them.
- `rebuildLivingSpecs` in `sync-specs.ts` already puts the default branch's specs in place and, for an archived change only, re-applies its deltas.
