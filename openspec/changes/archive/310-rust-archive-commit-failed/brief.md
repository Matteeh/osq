---
queue_item: rust-archive-commit-failed
queue_hash: sha256:3f968d513fd1baf96efbe0df2f4bed11f6e757d85e88418d6a210ad7bf726fb9
planner: null
date: 2026-10-23
---

### Goal

`archive-commit-recovery` makes TypeScript record a failed archive commit, make it later, and have land say what to run. Rust archive (295) fails loudly but records nothing, and Rust land lists the uncommitted paths. Both must write and read the same files as TypeScript, so either language can pick up the other's change.

### Context

As of 2026-10-23:

- `archive-commit-recovery` defines the record, the `osq retry <id> change` path and land's refusal. Read its archived change folder once it lands, not this brief.
- Rust: `crates/features/archive` commits the move with `osq: <id> archived` (295). `crates/features/land/src/land/checks.rs` refuses a dirty worktree. `crates/features/retry` handles `change` retries (277, 290).

### Requirements

- When the archive commit fails, Rust `osq archive <id>` writes TypeScript's failure record with git's error and exits non-zero.
- Rust `osq retry <id> change` on that record makes the archive commit and clears the record, with TypeScript's text.
- Rust `osq land <id>` on such a change refuses with TypeScript's text instead of listing paths.
- Tests use scratch repositories with a failing pre-commit hook and compare the files with TypeScript's `dist`.

### Non-goals

- The watcher's catch-up pass; that belongs to the loop.
