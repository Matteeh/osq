---
queue_item: rust-archive-feature
queue_hash: sha256:3415e9882cc5956566abb398f70a26b5b025bbccb634fac035ed1fbc6da93787
planner: null
date: 2026-10-21
---

### Goal

Archiving is the moment specs change. The archive feature does it in Rust with the specs kernel's merge, so the loop can archive a change once its tasks are done.

### Context

As of 2026-10-21:

- `crates/features/archive` (`osq-feature-archive`, capability `rust-archive`) is a placeholder.
- The specs kernel ports `mergeDelta` and validation (218, 219). The vcs kernel can stage and commit (245).
- TypeScript: `src/watcher/archiver.ts` (`archiveSpecFolder`, `checkAndArchiveSpec`, `tickAllTaskCheckboxes`), `archive-change.ts`, `archive-specs.ts` (the archive record and its restore) and `archive-sidecars.ts`.

### Requirements

- The archive feature's `archive` command, given a change whose tasks are all done, applies its deltas and sidecars to `openspec/specs/`, ticks its task checkboxes, writes the archive record and moves the folder under `openspec/changes/archive/`, with the same files and bytes as TypeScript.
- A change that is not done, or whose deltas do not apply, is refused with TypeScript's message and nothing is written.
- A golden test archives a fixture change and compares the resulting tree with the tree TypeScript produced once and committed.

### Non-goals

- The archive verify run, the validator, git commits and the `archived` event; the loop and the run feature own them.
- Restoring an archive.
