---
queue_item: approve-after-halt
queue_hash: sha256:5986474e9905105577e07e90e81df07a19c325ac87c2fdc35d7e0dd4de33c744
planner: null
date: 2026-09-29
---

### Goal

`osq approve` into a worktree finishes before the watcher looks at the change. A change-level halt points the human at `osq retry <id> change`, not at `osq reject`. A change that was approved, rejected, and planned again can be approved again under the same folder name.

### Context

As of 2026-09-29:

- `approveIntoNewWorktree` in `src/core/spec/approve-worktree.ts` creates the branch and worktree, copies the change folder in, writes the seal (`.run/approved`) with `writeApprovalSeal`, and only then commits `osq: <id> approved`.
- The watcher treats a worktree change with `.run/approved` as approved. `checkWorktree` in `src/watcher/worktree-run.ts` runs before a spawn (`src/watcher/loop.ts`, around line 308) and before an archive (around line 212). It halts with `worktree_dirty` when status lists any path outside the change's `.run/` and `tasks.md`.
- On 2026-09-29 the watcher halted 116 with `worktree_dirty` at 18:05:12.067Z, listing only the change's own `proposal.md`, delta spec, and task files. The approval commit landed in the same second. The halt came between the seal and the commit. `osq retry 116 change` cleared it, and 116 then ran and landed.
- For a change-level regression, `readActiveNextStep` in `src/core/status/next-step.ts` returns `osq reject <id> --reason <text>`, so `osq status` printed `next: dead — osq reject 116`. The inbox's `change-regressed` item in `src/core/status/inbox.ts` also carries `osq reject`. The dispatcher's `haltItems` in `src/core/status/dispatch-items.ts` already lists `osq retry <id> change` first.
- `osq reject` removes a worktree change's worktree but keeps its branch `osq/<folder>`, whose tip is the `osq: <id> rejected` commit holding the dead markers and events (`src/core/lifecycle/reject.ts`).
- `refuseExistingBranch` in `approve-worktree.ts` refuses when `osq/<folder>` exists. 115 was approved, died with `spawn E2BIG`, was rejected, and was planned again in the checkout under the same folder. `osq approve 115` then failed with `branch osq/115-retire-source-comments already exists`. The human renamed the branch by hand to `osq/115-retire-source-comments-rejected-1`.

### Requirements

- The watcher neither spawns, archives, nor halts a worktree change whose `.run/approved` is not yet committed at HEAD. It skips that change on this pass, writes no marker or event for it, and picks it up on a later pass once the approval commit exists.
- A change whose approval commit exists is checked exactly as today. A real `worktree_dirty` still halts.
- For a change-level regression with no dead or regressed task, `osq status`, bare `osq`, and `osq inbox` name `osq retry <id> change`.
- When `osq approve` finds `osq/<folder>` and its tip is osq's rejection commit for that change, it renames that branch to `osq/<folder>-rejected-<n>`, with the lowest `n` from 1 that is free, and then approves as usual. It prints one line naming the renamed branch.
- A branch `osq/<folder>` whose tip is anything else still refuses, as today.

### Non-goals

- Changing what `osq reject` does to the branch at rejection time.
- Deleting kept branches.
- Recovering an approval whose commit failed after the seal. `osq approve` already reports that error.

### Notes for planning

- Skipping keeps the watcher filesystem-driven: whether `.run/approved` is committed is read from git status each pass, not remembered.
- Recognize the rejection commit by what `osq reject` writes: its `osq: <id> rejected` subject and `Osq-Change: <folder>` trailer. Check `reject-vcs.ts` for the exact form and reuse it rather than matching a second copy of the text.
- A branch rename needs a `Vcs` write method if none exists. Check `src/core/vcs/git-vcs-write.ts` first.
- `tests/approve-worktree.test.ts` pins the `already exists` refusal. Keep that case for a non-rejection tip.
- Measure in a scratch worktree for tests that pin the `osq reject` hint in status, inbox, or bare `osq` output.
