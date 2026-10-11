---
queue_item: halt-recovery-scenarios
queue_hash: sha256:c705c3fc3105cd255df4841eff6557d0e89dff6de1db40dc1a7d0fbe9ffd2691
planner: null
date: 2026-10-11
---

### Goal

Each way a run fails and recovers is proven end to end by a test that starts from the failure and ends with the change running again, with no git by hand. A recovery bug is caught by the suite before a real run hits it.

### Context

As of 2026-10-10 (Notion: "Making osq bulletproof", candidate 3):

- Most osq bugs found in real runs since 141 were in code that only runs after something went wrong: the dead commit that overflowed git's buffer (149), `osq approve` from a worktree (149), a main sync flagging a done task (149), the stuck fingerprint (151), the stacked land conflict and land-order deadlock (161 to 165).
- 152 (`halt-self-recovery`) fixed the three known recovery bugs. Its tests cover each fix, not the whole path from failure to resumed run.
- A killed watcher leaves a running lock with a dead pid; the next `osq watch` reaps it as `crashed` and retries. That path is known from use, not from a scenario test.
- `@matteeh/osq/testing`'s `scenario` helper and `runWatcherOnce` with fake adapters (`tests/stack-run.test.ts`, `tests/vcs-land-refusals.test.ts`) can drive a whole run in a temporary repository.

### Requirements

- One scenario test per recovery path, at least: a dead task retried and done, a stuck task steered and approved again, a sync conflict on an active change restarted from main, a land stopped by a conflict and steered, a red verify at land steered, a killed watcher's lock reaped and its task retried, and approve after a halt.
- Each test ends with the change archived or the task done, through the same commands a human or the watcher would run.
- Any bug the tests find is fixed in the same change, or listed in the proposal as its own queue item when the fix is large.
- The scenarios are written into the owning capabilities' specs, so they stay pinned.

### Non-goals

- New recovery behavior beyond fixing what the tests find.
- Real model runs; fake adapters only.

### Notes for planning

- Measure first: run each path by hand in a scratch worktree to see which already work.
- Prefer one test file per path so tasks stay small and share no files.
