---
queue_item: steering-triggers
queue_hash: sha256:d883b0d921521e3f8f6c4fdae2cea9ce933dbb4819f6874a10b3023200715cbe
planner: null
date: 2026-09-30
---

### Goal

When a change needs a human's judgement, osq decides that, not whoever happens to be watching (ADR 006 decision 5). Each trigger halts the change, records the reason and its evidence, and offers one action: plan it. That opens a planning session with the change, the reason and the evidence loaded. The revised plan comes back for approval, and the run continues from the last verified task. Nothing on this path needs a shell.

### Context

As of 2026-09-28, each trigger ends somewhere different:

- A stuck task, one that died twice with the same fingerprint, waits for `osq retry <id> <n>` after the human finds and fixes the cause.
- A `blocked` task, where the executor says the plan lacks something, waits for the human to edit the plan, approve again and retry.
- A regression at archive writes `.run/regressed/<n>.md` or `change.md` and waits for `osq retry`.
- A code conflict at land stops with the conflicting paths, and the human merges by hand in the worktree.
- After `osq-sync`, a sync that finds a requirement changed on the default branch, or a code conflict, halts the change with a reason.
- A red `verify` at land on an archived change has no way out inside osq. `osq reject` refuses archived changes, and the watcher no longer runs the change. On 2026-09-29, 112 archived under an osq build older than 109. That build ran the change-level `verify` before applying the deltas, and 112's delta removed a requirement that `tests/living-specs-delta-equivalence.test.ts` pins, so `osq land 112` failed. A human fixed it by hand in the worktree.
- `osq plan <id> --session` reopens a planning session on an existing change that has a `brief.md`, and `osq plan` writes `plan-prompt.md` into the change folder.
- ADR 003 decision 4: re-approval runs `osq approve` against the worktree and commits the edits with the new hash.
- Transient deaths such as `verify_red`, `timeout` and `crashed` already retry automatically.

### Requirements

- A fixed list of triggers halts a change for steering: a stuck task, a blocked task, a requirement the change rewrites that changed on the default branch, a code conflict at sync or land, a red `verify` at sync or land, and a regression at archive. An archived change that halts can still be planned and run again. The list lives in a spec, and adding a trigger is a spec change.
- A halted change has one inbox item, "needs steering", naming the trigger, its reason and its evidence: the dead marker, the conflicting paths, or the changed requirement.
- The item's one action plans the change: a planning session on the change's own folder, with the trigger, the reason and the evidence in its prompt.
- After the revised plan is approved, tasks already verified stay done, and the run continues from the first task that isn't.
- Transient deaths keep retrying automatically and raise no item until they are stuck.

### Decide before planning

- The command for the action at the CLI before the UI exists. Probably `osq plan <id>`, reading the halt from the change's `.run/`.
- Which done markers a revised plan keeps when it changes a done task's scope or verify.
- Whether `osq retry` stays for a human who fixed the cause outside osq.

### Non-goals

- The UI action and notifications. Those are later milestones on the roadmap.
- An AI resolver for code conflicts. It waits until sync data shows conflicts are common and mechanical.

### Notes for planning

- Read ADR 006 decision 5 first.
- Research the plan-prompt builder, the dead and regressed markers, and the re-approval path in the worktree before writing tasks.
