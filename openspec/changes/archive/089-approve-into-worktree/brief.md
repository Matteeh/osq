---
queue_item: approve-into-worktree
queue_hash: sha256:57204cad4215d770ffc8e1da55d38e588e85bc3cb896cfbdede245208fa0b081
planner: null
date: 2026-09-26
---

### Goal

With `vcs.enabled`, `osq approve` gives the change its own branch and worktree, and writes nothing to the checkout. Status shows the change running in that worktree. Nothing runs worktree changes yet; `run-in-worktree` does that. With the flag off, approve behaves exactly as today.

### Context

- ADR 003 decisions 2 and 11, as revised on 2026-09-26. This is change 3 of stage 1.
- Change 087 added `src/core/status/change-locations.ts`. `changeTrees` returns one tree today and is async so it can list worktrees. Every reader of running changes goes through it.
- Change 088 added `vcs.enabled`, `vcs.author`, `vcs.worktreeRoot`, and `vcs.prepare`, and the port's `createBranch`, `worktreeAdd`, `worktreeList`, and `commit`.
- `createInvalidationHub` in `src/core/web/web-events.ts` is synchronous and falls back to one tree, because `src/core/web/web-server.ts` builds its options without resolved trees. Found in 087 task 4.

### Requirements

- Approve lints and hashes the draft in the checkout, committed or not. It cuts `osq/<folder>` from HEAD and adds a worktree at `<vcs.worktreeRoot>/<repo>/<folder>`. `vcs.worktreeRoot` defaults to `~/.osq/worktrees`, `~` expands to the home directory, and `<repo>` is the repository root's folder name.
- Approve runs `vcs.prepare` once in the new worktree when it is set. A failing prepare stops the approval with its output and removes nothing.
- Approve copies the change folder into the worktree and commits the folder with `.run/approved`, `.run/base` (the commit the branch was cut from), and `.run/approver` (`user.name <user.email>` from git config) as the branch's first commit, `osq: <id> approved`, authored by `vcs.author`.
- Approve refuses when HEAD is not on the default branch unless `--base-ok` is passed. The default branch is the branch `origin/HEAD` names when a remote exists, else `vcs.defaultBranch`, else `main`. `vcs.defaultBranch` is a new optional config key.
- Approve refuses when uncommitted changes in the checkout intersect any task's resolved scope, unless `--ignore-dirty` is passed, and names the files.
- Approve refuses when `osq/<folder>` already exists.
- Until `stacking` lands, approve refuses a change whose `depends_on` names an approved change that has not landed, and names that change.
- `changeTrees` lists the osq worktrees from `worktreeList` after the checkout, and `listChanges` reports a running change from its worktree, not from the checkout's copy.
- `osq status` shows a running change with its worktree path, and warns when the checkout's copy no longer matches the approved hash.
- `web-server.ts` resolves the trees and passes them to `createInvalidationHub`.

### Non-goals

- Running tasks in the worktree, committing task results, or the dead path.
- Stacking.
- Removing worktrees.

### Notes for planning

- Test against temporary repositories with `vcs.worktreeRoot` inside the test's temporary folder, never the real home directory.
- `src/watcher/runner.ts` has 196 lines and must stay under 200.
- The checkout's copy of the folder keeps no `.run/approved`, so decide how the resolver tells a running change's checkout copy from a draft: a worktree exists for it.
