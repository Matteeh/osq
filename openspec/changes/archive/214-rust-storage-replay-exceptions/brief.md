---
queue_item: rust-storage-replay-exceptions
queue_hash: sha256:748d18fd5a0ad805a742601ce082aafcbc6e6e82f2253e7646421f290b3e6f8b
planner: null
date: 2026-10-18
---

### Goal

The living rust-storage spec says what the replay test checks: changes 003 to 013 are the named exceptions, not 004 to 013.

### Context

As of 2026-10-18:

- The rust-storage requirement "Archive replay" and its scenario "Archived changes replay" say the exceptions are 004 to 013, whose watcher wrote no `done` event.
- Change 210's task 4 found that `003-watcher-and-harness` has no `.run/events/` folder and done markers 1 to 5, so it folds to all pending like 004 to 013. The test in `crates/kernel/storage/tests/archive_corpus.rs` therefore lists 003 to 013, and it passes. The executor said so under `## Deviated` and `## Missing context`.
- Living specs change only through an archived delta.

### Requirements

- A MODIFIED delta of "Archive replay" says 003 to 013, in the requirement text and in the scenario "Archived changes replay", and keeps every scenario it has.
- The change's verify proves the test and the spec agree. No Rust source changes.

### Non-goals

- Any change to the replay test or to storage's reading.
