---
queue_item: manual-edits
queue_hash: sha256:aaec5463200eda8ca6f215e0d6979cf3498138d44800afdd7613cc253c8ae333
planner: null
date: 2026-10-15
---

### Goal

When osq stops because the human's checkout holds uncommitted edits, the human keeps them with one command and a comment: osq commits them as a manual change, records what they touched, and the command that stopped can run again. The next planner for a capability the edits touched is told about them. A project that wants the old strictness opts into blocking.

### Context

As of 2026-10-15:

- `osq approve` refuses uncommitted edits inside any task's scope: `uncommitted changes in task scope: <paths>; commit them or pass --ignore-dirty` (`refuseDirtyScope` in `src/core/spec/approve-worktree.ts`).
- `osq land` stops when the fast-forward would overwrite an uncommitted path (`fastForward` in `src/core/vcs/git-vcs-land.ts` returns `blocked`). This has stopped landing several times on local `osq.config.ts` edits (188, 194).
- Each stop has its own fix, and the human commits by hand, outside osq, with no record of why. ADR 003 says osq alone writes to git and writes the human's checkout only through commands the human runs.
- Paths in `ungoverned` belong to no capability and are already editable on the default branch without a change.
- Code ownership (`Code ownership` requirements, one reader) maps a path to its capability.

### Requirements

- A new command, for example `osq manual "<comment>" [paths…]`, commits the checkout's uncommitted edits (all of them, or the paths named) on the current branch with the comment in the commit message. It refuses an empty comment, and refuses while nothing is uncommitted.
- Each kept edit leaves a record file in the repository, holding the date, the comment, the paths, and the capabilities those paths belong to. Ungoverned paths are listed but belong to no capability. `osq query` gains a table over these records.
- The refusals of `osq approve` and `osq land` above name the command as the way to keep the edits, next to the existing fixes.
- When a change is planned whose delta or scope touches a capability with manual edits recorded since that capability last changed through osq, the plan prompt lists them (date, comment, paths) so the planner can bring the spec in line. Nothing blocks.
- A config key, for example `manualEdits: 'keep' | 'block'`, default `'keep'`. With `'block'` the command refuses and names the key, and the refusals do not offer it.

### Non-goals

- Edits made during a run inside a change's worktree; today's halt and `osq retry` stay.
- Detecting commits made straight to the default branch without osq.
- Editing specs automatically, or queueing a follow-up item.
- A dashboard or phone button; the CLI and `osq mcp` forwarding come first.
- `osq sync`'s own worktree dirt check.

### Notes for planning

- The commit is a write to the human's checkout through a command the human runs, so ADR 003 holds; say so under Decisions.
- Keep the surface to one command and one config key.
