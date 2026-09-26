---
queue_item: worktree-holds-change
queue_hash: sha256:48bbfaaff6e22f1c06393e0436702f36a8cacf11838663c9a39efbc8dd7694f7
planner: null
date: 2026-09-26
---

### Goal

A worktree on `osq/<folder>` that holds no change folder no longer hides that change's stacked approval, so a failed stacked cut can keep the worktree it added and the retry reuses it, as change 094's "Stacked cut" first intended.

### Context

- `changeTrees` in `src/core/status/change-locations.ts` names a folder by a worktree's branch alone, and then drops the stacked tree for the same folder.
- Change 094's task 4 worked around this: a failed cut removes the worktree it added and prunes git's record before it rethrows, keeping the branch and the stacked approval. Reported in its result's `## Deviated`.

### Requirements

- A worktree tree names its folder, and hides the checkout's copy and any stacked tree of that folder, only when the worktree holds that change folder in its changes, archive, or rejected directory.
- A stacked cut that fails keeps the branch, the worktree it added, and the stacked approval. After `osq retry <id> change`, the next cycle reuses both.

### Non-goals

- Any other change to stacking.

### Notes for planning

- `tests/stack-run.test.ts` pins the current removal in its "Cut fails and resumes" case, and `tests/change-locations-stacked.test.ts` pins "Stacked folder with a worktree". Measure the fallout before scoping.
- `stack-dependencies.ts` copies `findChange`'s unexported `matchesFolder`; exporting it from `change-locations.ts` removes the copy.
