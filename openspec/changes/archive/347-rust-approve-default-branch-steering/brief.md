---
queue_item: rust-approve-default-branch-steering
queue_hash: sha256:1fba7e5dc71bfc39d1dc258d98650629949cb7c990a8796bd7e8ec632c8ae070
planner: null
date: 2026-10-25
---

### Goal

Change 325 re-approves a change steered by run triggers only. A change can also be steered because the default branch moved under it: a sync conflict, a requirement main rewrote, or a red verify after a sync. Rust approve should handle that case too.

### Context

As of 2026-10-25:

- TypeScript handles default-branch triggers in `src/core/spec/approve-default-branch*.ts`: a conflict restarts the whole change from main, any other trigger merges main and keeps done tasks.
- The 326 post-mortem (Notion, 2026-10-24) sets the rule: never restart without first trying to merge or rerun only the affected tasks. The Loop design brief agrees: a conflict in files a task owns reopens that task and those after it; a conflict in the plan, the specs or a file no task owns flags the change for planning.
- A first plan of this item (343, 2026-10-25) ported TypeScript's restart and merged through a land reaction; it was held so the merge runs inline through `rust-sync-kernel` instead. Its golden script and merge goldens, the archived lookup, and retry's later-failure guard carry over.
- ADR 030 (326) lets a feature react to the `approved` event; 325 makes retry react to it for run triggers.

### Requirements

- Rust `osq approve <id>` on a change in its osq worktree with a default-branch trigger merges the default branch inline through the sync kernel, with verify off, and keeps every done task, as TypeScript's merge path does. Archived changes that need steering are found in their worktree.
- A conflict never restarts the whole change (326 post-mortem rule). Rust-first for `conflict-reruns-owning-tasks`: approve takes the default branch's version of each conflicted file, commits the merge, and reopens each done task whose resolved scope holds a conflicted file, plus every task after the first reopened one. Each reopened done marker is kept as a previous attempt, and every other done task is recertified on the merged tree. A conflict in the plan, the specs, or a file no done task owns stops the change for planning instead.
- `osq approve` prints which tasks it reopened and why, naming the conflicted files.
- Approve never calls another feature; clearing the triggers stays retry's reaction to the `approved` event (ADR 030). Retry leaves a target alone when a failure was recorded after the approval.
- Re-approving with no plan edit works: the approval commit always holds a new `approved` line.
- Tests use scratch repositories; the merge path compares with TypeScript's `dist`, and the reopen path, which TypeScript lacks, is specified directly.

### Non-goals

- Stacked changes, and restarts that stack on the chain tip.
- Auto-steer.
- A merge agent.
