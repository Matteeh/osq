---
queue_item: archive-keeps-seal
queue_hash: sha256:5d8d5787d3f076f7c646a21eda9f930d9ceaa8aaa0ac290800aee1846af2d2fe
planner: null
date: 2026-10-21
---

### Goal

An archived change's seal should still match its `.run/approved` marker, so the archive keeps proving what was approved. Today the archiver writes files the seal covers, and 248's land failed on it.

### Context

As of 2026-10-21:

- `ensureArchivedTasksTicked` in `src/watcher/archiver.ts` ticks every `tasks.md` at any depth of the change folder, with `tickAllTaskCheckboxes` (`-` and `*` bullets).
- `hashChangeFolder` in `src/core/spec/hasher.ts`, and its Rust port `change_folder_seal` in the storage kernel, clear ticks only in the root `tasks.md`, and only on `-` bullets. A nested file with a reserved name is authored content, as `plan-prompt.md` already is.
- 248 carried a fixture with nested `tasks.md` files. Archiving ticked them, its seal no longer matched its marker, and `crates/kernel/storage/tests/seal_corpus.rs` failed at land. The two files were restored by hand on the land branch.
- 248's `rust-archive` spec ports the current behaviour: archive ticks every `tasks.md`, including a nested one and `*` bullets.

### Requirements

- The TypeScript archiver ticks only the root `tasks.md`, and only the checkboxes the seal clears, so a nested `tasks.md` keeps its bytes.
- The Rust archive feature and its `rust-archive` spec do the same, byte for byte with TypeScript.
- A test archives a fixture change with a nested `tasks.md` and a root `tasks.md`, and checks that the archived folder's seal equals its approval marker.

### Non-goals

- Changing the seal itself; that would change the seal of approved changes in flight.
- Rewriting changes archived before this one.
