---
queue_item: osq-sync
queue_hash: sha256:a514afdd4baf5be0983019e6bd59f0c9bbc1f7792168a1b10ee444198c8f419c
planner: null
date: 2026-09-29
---

### Goal

A change's branch takes in the default branch before its first task and before archive, and on request with `osq sync <id>`, so its archive is computed against current `main` and its land rarely conflicts.

### Context

- ADR 003 decision 5: osq never rebases; to take in `main`, it merges `main` into the branch as a new commit, `osq: <id> sync main`. It does so before the first task (except a stacked dependent whose dependency has not landed), before archive, and on request. A sync is a no-op when `main` is already an ancestor of the branch tip. A blocked change is re-derived after a sync.
- `osq-land` rebuilds living specs from deltas at land and tells the human to run `osq sync <id>` on any other conflict.
- Change 107 built `syncWithDefaultBranch` in `src/core/vcs/sync-main.ts`, with its requirement check and spec rebuild in `src/core/vcs/sync-specs.ts`. It merges the default branch into the branch in the worktree, stops before re-applying a delta over a requirement the default branch changed, rebuilds living specs with `applyOpenSpecDeltas`, runs `vcs.prepare` and the proposal's `verify`, and commits `osq: <id> sync <default branch>`. Only `osq land` calls it, on an archived change. The watcher's syncs run on active changes.
- `deterministic-land` changes when land and archive verify. Read its archive before planning.

### Requirements

- `osq sync <id>` merges the default branch into the change's branch in its worktree as `osq: <id> sync main`, refusing while a task of the change runs.
- A conflict only in living specs is resolved by rebuilding them from the default branch's specs and the change's deltas, as `osq land` does. Any other conflict aborts the merge, leaves the worktree as it was, and halts the change with a reason that names the conflicting files for a human.
- The watcher syncs before a change's first task and before archive, as ADR 003 decision 5 says.
- `osq status` shows the last sync per change.

### Non-goals

- Mode B.
- Resolving code conflicts automatically.

### Notes for planning

- Test with real temporary git repos, including a stacked dependent whose dependency lands during its run.
