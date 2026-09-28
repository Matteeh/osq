---
queue_item: archived-once
queue_hash: sha256:60938c8363e9e415136897a215eb92d04ebe289a3bca3076987e3f8014e9a5bc
planner: null
date: 2026-09-27
---

### Goal

After a change lands by hand, osq counts its archive once. Today the kept worktree still holds the archive, so osq sees two archived changes with the same folder, and `osq queue` fails.

### Context

- On 2026-09-27, after changes 101 and 102 landed by hand on `main` with their worktrees kept under `~/.osq/worktrees/osq/`, `osq queue` failed with `Ambiguous queue association for "inbox-wait-log": multiple archived changes (101-inbox-wait-log, 101-inbox-wait-log)`, from `src/core/status/queue-state.ts`.
- `listChanges` in `src/core/status/change-locations.ts` lists changes from every tree the resolver returns: the checkout and each worktree. A landed change's archive is in both.
- `osq message` reads the archive from the kept worktree (change 095), so the worktree cannot simply be dropped from the resolver.

### Requirements

- When the same archived folder is in the checkout and in a worktree, the resolver lists it once, from the checkout, since the checkout's copy is the landed one.
- `osq queue`, `osq status`, bare `osq`, `osq inbox`, and `osq report` each count such a change once.
- `osq message <id>` still works for a change that has not landed.

### Non-goals

- Removing worktrees. That's `osq-land`.

### Notes for planning

- Reproduce with a real temporary git repo: approve and archive a change in a worktree, squash it onto the default branch by hand, keep the worktree, then read the queue and status.
- Check every caller of `listChanges` and `changeTrees` for its own de-duplication before adding one in the resolver.
