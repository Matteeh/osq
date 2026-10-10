---
queue_item: landed-means-on-main
queue_hash: sha256:8368c54db4fdac51b2f244420f59ba42e2212a59ca8fd5b3b334198aa69852fa
planner: null
date: 2026-10-10
---

### Goal

`osq show`, `osq status`, `osq queue` and the dashboard say a change is landed only when the default branch holds it. An archived change that has not landed says so and names `osq land <id>` as its next step.

### Context

As of 2026-10-10:

- `readArchivedNextStep` in `src/core/status/next-step.ts` returns state `landed` for every archived change that needs no steering, without asking git. `osq show 160` printed `Next: landed` while main stopped at 159.
- `selectAssociation` in `src/core/status/queue-state.ts` maps any archived association to `landed`. On 2026-10-10 `osq queue` showed remote-cli and local-mcp as `landed` while both sat unlanded.
- `readDependencyState` in `src/core/spec/stack-dependencies.ts` already tells `landed` from `archived` with git, and `osq land`, `dispatch-land.ts` and `show-land-model.ts` use it.
- `osq status` prints archived changes as one count, `Archived specs: <n>`, with no landed or unlanded split.
- Result: 160 to 163 sat archived for a day with nothing pointing at `osq land`.

### Requirements

- With git, an archived change that the default branch does not hold has its own next-step state (for example `archived`) whose command is `osq land <id>`, in `osq show`, `osq status`, the inbox and the dashboard.
- `osq queue` and the queue report show such an item as archived, not landed.
- `osq status` lists archived changes that have not landed by id, each with `osq land <id>`.
- Without git (`vcs.enabled` off), archived stays the end state, as today.

### Non-goals

- Changing what `osq land` does.

### Notes for planning

- Reuse `readDependencyState`; don't add a second way to decide landed.
- Many tests and golden fixtures pin `Next: landed`; measure the fallout in a scratch worktree before writing task scope.
