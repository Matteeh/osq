---
queue_item: stacking
queue_hash: sha256:ded2240da3045f368f7a15062e28e2b2ed546f4b4e3440c82da9b206a47fffdf
planner: null
date: 2026-09-26
---

### Goal

A chain of dependent changes approved at once runs without a human, as it does today. A dependent approved before its dependency lands is cut from the dependency's archive commit once that commit exists.

### Context

- ADR 003 decisions 2 and 5. This is change 6 of stage 1.
- `approve-into-worktree` makes approve refuse such a dependent; this change replaces that refusal.

### Requirements

- Approving a change whose `depends_on` names an approved change that has not landed records the approval and waits. When the dependency's archive commit exists, osq cuts the dependent's branch from it and creates its worktree.
- A dependency has landed when its archive folder exists on the default branch.
- When the dependency changes or is rejected before it lands, the dependent halts with a message saying to approve it again, and approving it again cuts it from the new base.
- With `vcs.enabled`, `osq reject` removes the change's worktree when it is clean and keeps its branch.

### Non-goals

- Syncing a dependent after its dependency lands. That is stage 2.

### Notes for planning

- Checking whether a path exists at a ref needs a new read on the `Vcs` port. Add it as a read, and keep the port's never-list test passing.
