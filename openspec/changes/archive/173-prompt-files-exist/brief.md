---
queue_item: prompt-files-exist
queue_hash: sha256:bcef4b76c97712c7685021c614909db31514af22b26e8102a541da4f75380cc0
planner: null
date: 2026-10-11
---

### Goal

A task whose `entry` names a file that does not exist does not spend an executor attempt. osq stops it before spawning, names the file, and points at planning, the same way a planning gap ends today.

### Context

As of 2026-10-10:

- Each task's frontmatter `entry` lists the files the executor should read first. `spawnTask` in `src/watcher/spawn.ts` passes `taskData.entry` to the harness prompt, and nothing checks that the files exist.
- `src/core/spec/verify-paths.ts` (change 067) already makes a `verify` that names a missing file count as red, and lint checks paths in `verify`.
- 163 task 2 named `resolveRemoteChange` and `isSafeUploadPath` in `src/core/web/web-remote-files.ts`, which 162 had refactored away; the executor wrote private copies and reported it under `## Missing context`. A missing `entry` file is the file-level form of the same planning gap.
- This is the unfinished half of the old roadmap item 2.4, "impact and verify quality lint".

### Requirements

- `osq lint` reports an `entry` path that does not exist in the tree the change is approved against and that no earlier task's `scope` can create.
- Before spawning a task, the watcher checks every `entry` path in the worktree. When one is missing, the task does not spawn: it halts with a steering reason that names the paths and `osq plan <id>`, and no attempt is counted.
- A glob in `entry`, if allowed today, counts as present when it matches at least one file.

### Non-goals

- Checking names of functions or exports inside files.
- Checking `scope`, which may name files a task creates.

### Notes for planning

- Check whether `entry` may hold globs today, and how the existing steering triggers record a reason, so the new one fits `osq status`, the inbox and `osq plan <id>`.
- Grep the archive for tasks whose `entry` named a missing file, to size the problem and get a real fixture.
