---
queue_item: dead-path-building-blocks
queue_hash: sha256:3e4dfa4b6cffc55b40747257d3e1f35a4de31916c3acf3661d0e71afae20ae0a
planner: null
date: 2026-09-26
---

### Goal

osq has the pieces that put a worktree back to its last verified state after a task dies, each tested on its own against a temporary worktree. Nothing calls them yet; `run-in-worktree` wires them in.

### Context

- ADR 003 decisions 1 and 4. This is change 4 of stage 1. It comes before `run-in-worktree` so that no state with the flag on leaves a dirty worktree behind a dead task.
- Change 088 added the port's `patch`, `discard`, and `commit`.
- `discard(paths)` in `src/core/vcs/git-vcs-write.ts` runs `clean -fd -- ...paths`. With an empty list that removes every untracked file in the worktree, the change folder included. Found reviewing 088.

### Requirements

- A dead task's record is built in this order: write `.run/dead/<n>.patch` from `patch()`, then discard every changed path outside the change folder, then commit the dead record. The patch is always written before anything is discarded.
- `discard` returns without running git when given no paths.
- The dead commit has the subject `osq: <id> task <n> dead, reason <reason>` and holds `.run/dead/<n>.md`, `.run/dead/<n>.patch`, and `.run/events/<n>.jsonl`, and no code.
- For `spec_conflict`, the edits to the change folder are the human's: osq commits only `.run/` and leaves the folder edits uncommitted.
- One function builds every osq commit message: subject, a body of the task title and outcome line, and trailers `Osq-Change`, `Osq-Task`, `Osq-Model`, and `Osq-Version` taken from the task's `started` event, in the form `git interpret-trailers` reads. `run-in-worktree` reuses it for verified tasks.
- Commits are authored by `vcs.author`.

### Non-goals

- Calling any of this from the runner, the loop, or the reaper.

### Notes for planning

- Test each piece against a temporary repository with a linked worktree on an `osq/` branch, including a patch that restores a new untracked file with `git apply`.
