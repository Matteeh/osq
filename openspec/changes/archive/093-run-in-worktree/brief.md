---
queue_item: run-in-worktree
queue_hash: sha256:ce09d986e33be04fdca7c7ff376784855e4178430319aeb9937e93a5fd583c6d
planner: null
date: 2026-09-26
---

### Goal

With `vcs.enabled`, a change runs start to finish on its own branch. Each verified task is a commit, a dead task leaves a clean branch tip and a patch, the archive is the last commit, and protocol violations kill the task. With the flag off, the watcher behaves exactly as today.

### Context

- ADR 003 decisions 1, 3, 4, 8 and 11. This is change 5 of stage 1.
- Stage 0's git guard in `src/watcher/git-guard.ts` records `vcs_violation` and `scope_violation` without killing.
- AGENTS.md says new test files are always allowed, but stage 0 recorded a `scope_violation` for a new test file outside scope in 087 task 4.

### Requirements

- The watcher runs each running change with its worktree as `projectRoot`, so verify, `OSQ_CHANGE`, and the adapters work inside the worktree.
- Before every spawn the worktree is on its branch and clean outside the active change's `.run/`. Otherwise the change stops with a message naming the files.
- A verified task is committed with its scope edits, `.run/done/<n>`, `.run/results/<n>.md`, `.run/events/<n>.jsonl`, and the tick in `tasks.md`, as `osq: <id> task <n> verified`.
- The archive is committed as `osq: <id> archived`.
- A commit that fails halts the change with git's output and is not retried.
- The git guard runs against the worktree. `vcs_violation` and `scope_violation` kill the task through the dead path. A new test file outside scope is not a scope violation, because AGENTS.md allows it.
- A crash reaped by `reapStaleLocks` takes the same dead path.
- `osq watch` recreates a missing worktree for an `osq/` branch whose change is approved and has a pending task.
- `osq status` warns not to edit a worktree while a task runs in it.
- `retry`, `reject`, `done`, and `verified` write their markers where the change runs.

### Non-goals

- Stacking, sync with main, `osq land`, and concurrency.

### Notes for planning

- `src/watcher/runner.ts` has 196 lines and must stay under 200; new behaviour goes in new modules called from the loop, or through one statement.
- This is the largest stage-1 change. Split it into tasks by pipeline step, and measure test fallout in a scratch worktree first.
