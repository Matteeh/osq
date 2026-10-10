---
queue_item: approve-waits-for-overlap
queue_hash: sha256:849f9dde0826aaf3d278cdfe9100d8882e4be59d9d9818b283b6bda90d0e08b0
planner: null
date: 2026-10-10
---

### Goal

Approving a change while another change that writes the same capability is approved, running or archived but not yet landed no longer leads to a sync conflict and a restart. The two changes run one after the other without the human remembering to land first.

### Context

As of 2026-10-10 (Notion: "Making osq bulletproof", candidate 4):

- `approveIntoWorktree` in `src/core/spec/approve-worktree.ts` stacks a change only on the `depends_on` entries that `awaitedDependencies` reads as approved or archived. A change that only shares a capability is cut from the default branch next to the other one.
- 150 halted with `sync_conflict` against 149 and ran both tasks twice. 161 conflicted with 160 on a requirement and restarted from main. The restarts of 161 to 163 cost about $3 of the queue's $5.82.
- Since 165, a stacked change takes the default branch cleanly after its dependency lands, through the bridge commit in `src/core/vcs/sync-bridge.ts`, and `assertNoEarlierChange` in `src/core/vcs/land-checks.ts` skips a change stacked on the one being landed.
- `findLandCandidates` in `src/core/status/dispatch-land.ts` lists changes archived in osq worktrees that have not landed. `listDeltaCapabilities` in `src/core/vcs/sync-specs.ts` lists the capabilities a change writes.
- The habit "land before the next approve" is in the user's notes, not a gate.

### Requirements

- When `osq approve` finds another change that is approved, running, or archived but not landed, and writes a capability this change also writes, it stacks this change on that one as if `depends_on` named it, and says so in one line naming the other change.
- The stacking is recorded where stacking already is (`.run/stacked-on`), so cut, sync, land and the land-order check treat it like a declared dependency.
- A change that shares no capability is cut from the default branch as today.
- The approve view and `osq show` say which change this one waits for and why.

### Non-goals

- Overlap by code file alone. Capability overlap is what conflicts at sync, because living specs are rebuilt per capability; file overlap can follow later with data.
- Running two overlapping changes in parallel.

### Notes for planning

- Weigh stacking against refusing. Stacking keeps the run unattended; refusing is simpler but brings back a human step.
- Decide which change to stack on when several overlap: the latest one, so the chain stays linear, or all of them, as `depends_on` with two entries does.
- Check how a stacked change behaves when the change it waits for is rejected; `decideStackCut` halts with `dependency` reasons today.
