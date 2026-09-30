---
queue_item: approve-owns-draft
queue_hash: sha256:561d8c1c9cf9dd326e3c1b00e76bc42d7b6cb54fee8fbcbe8548eb0f2729a425
planner: null
date: 2026-09-30
---

### Goal

After `osq approve`, a change lives in one place: its branch and worktree. The checkout's copy, which looks like the plan but no longer drives anything, is removed at approval. `osq done`, which marks a task done without its verify, is removed, as ADR 006 decision 3 says.

### Context

As of 2026-09-28:

- With `vcs.enabled`, `approveSpec` copies the draft into the new worktree (the `fs.cp` in `src/core/spec/approve-worktree.ts`), commits it there, and leaves the checkout's copy in place. ADR 003 decision 2 chose that so `osq land` would be the only command that writes the checkout.
- The copy has a cost: `findLeftoverDrafts` in `src/core/status/leftover-drafts.ts`, the `Leftover drafts:` section of `osq status`, the "copy edited since approval" warning, the hash matching, and the cleanup in `osq land`. On 2026-09-28 a planning session opened on 107's leftover copy as "uncommitted work".
- A stacked approval copies the folder to `<vcs.worktreeRoot>/<repo>/.stacked/<folder>` instead of a branch. Without `vcs.enabled`, the checkout's folder is the change itself.
- `osq done <id> <task>` writes a done marker with a justification and no verify (`src/core/lifecycle/done.ts`, `src/cli/done.ts`). No archived change used it. AGENTS.md's Principles say a human writes manual `done` through the CLI, and squash outcome lines print `[manual]` for such a task.

### Requirements

- With `vcs.enabled`, `osq approve` removes the checkout's copy of the folder once the approval commit exists on the branch, or once the stacked approval is written. A failed approval leaves the copy.
- Without `vcs.enabled`, approval moves and removes nothing.
- ADR 003 decision 2 and its rule say osq writes the checkout only through commands the human runs: approve and land.
- `osq done` is removed: the command, its core module, and every mention in README, AGENTS.md and the templates. Archives holding a manual done marker still read as they do today.

### Decide before planning

- Whether leftover-draft detection stays as a safety net for drafts left by older approvals and hand landings, or goes.
- Where a human edits a running change's plan once the checkout has no copy. ADR 003 decision 4 says re-approval runs against the worktree. `steering-triggers` builds on the answer.

### Non-goals

- Changing what a stacked approval stores.
- `osq verified`. That's `checks-osq-runs`.

### Notes for planning

- Removing a command removes surface from a published package. Say so in CHANGELOG.
- Tests pin `osq done` and the leftover-draft section. Measure the fallout in a scratch worktree first.
