---
queue_item: sqlite-read-index
queue_hash: sha256:7db814017ee3ced521a646f1f3796d2d5655c07775d721ec9bac5a1bdc278cf5
planner: null
date: 2026-10-01
---

### Goal

`osq report` stays fast as the archive grows, because what it needs from archived changes is read once into a local SQLite index and reused. The files stay the only source of truth: deleting the index changes nothing but the next run's speed.

### Context

As of 2026-10-01:

- Node 24.21 ships `node:sqlite` (`DatabaseSync`, SQLite 3.53.4). It loads without an experimental warning, and `@types/node` 24 types it. `package.json` requires Node 24 or later. So the index needs no new runtime dependency and no dependency ADR. Check its stability level in the Node 24 docs before relying on it, and fall back to reading the files when the module is missing.
- AGENTS.md: "Any index or cache is derived from the files and may be deleted at any time."
- An archived change never changes once landed, except that `osq land` can append to its `change.jsonl`. Active changes live in their own worktrees, each with its own `.run/`.
- `osq land` commits each change's `.run/events/*.jsonl` to the default branch, so the index must stay out of git.
- `report-reads-once` leaves one place where report reads and parses each stream. Its proposal records the report time after that change; start from that number.
- The Notion page "SQLite read index: fast queries over osq's files" has the full reasoning: why the files stay truth (git, worktrees, fixed writers, restart safety), the incremental rebuild by size and mtime, and the AI access idea that `agents-query-osq` takes up.

### Requirements

- osq keeps a SQLite index of what `osq report` reads from archived changes. It lives outside git: either a git-ignored path in the project or under the user's `~/.osq/`, next to the worktrees. Decide which in planning. If it lives in the project, `osq init` adds it to the consumer's `.gitignore`.
- The index is rebuilt, per file, whenever that file's size or mtime differs from what the index recorded. A file that no longer exists drops out of the index.
- Deleting the index, or a corrupt or unreadable index, is never an error. The next command rebuilds what it needs and prints the same result.
- `osq report` reads archived changes through the index and active changes from the files. Its output is byte-identical to reading everything from the files.
- An ADR records the decision: SQLite is a derived read index, files remain the source of truth, nothing writes state only to the index, and only osq's own code opens it.
- Two osq commands running at once never corrupt the index. A command that can't write it reads the files instead and prints the same result.

### Non-goals

- Moving any state, marker or event out of files.
- Indexing anything `osq report` does not read.
- `status`, the inbox and the dashboard reading through the index. A later change can, once this one shows the shape holds.
- A query command. That is `agents-query-osq`.

### Verify

`pnpm verify`, plus tests:

- report output from the index equals report output from the files, over a fixture archive
- deleting the index, then reporting, gives the same output and rebuilds it
- a corrupt index file is replaced, not reported as an error
- appending a line to an archived `change.jsonl` updates that change in the index on the next run
- a removed archive drops out of the index

### Notes for planning

- Name the capability that owns the index in its Code ownership; a new capability needs `creates` and a reason it isn't metrics-and-reporting.
- Record the report time on this repository before and after in the proposal's Background.
