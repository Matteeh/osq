---
queue_item: rust-storage-hardening
queue_hash: sha256:df66ee0ec10847b04099d887162d49709b5a0adfbc941e566cd4da8d30c26b9b
planner: null
date: 2026-10-20
---

### Goal

A crash mid-rebuild never leaves a half-built read model, and storage reads osq's files through one typed path each instead of loose JSON values and a second YAML reader.

### Context

As of 2026-10-19:

- `build_read_model` (`crates/kernel/storage/src/model/mod.rs`) calls `write_read_model`, `apply_labels`, `insert_manual_edits` and `write_task_outcomes`, and each opens its own `Connection` on `db_path` (also `model/labels.rs`, `model/insert_files.rs`, `model/insert_specs.rs`). `write_read_model` first removes the existing file, so a failure between the steps leaves a database with only some tables filled.
- ADR 022 and ADR 008's carried-over rule: the read model can be deleted and rebuilt at any time, and no state lives only in it.
- `read/snapshot/folder.rs` reads `.run/manifest.json` as an untyped `serde_json::Value`. ADR 025 keeps `manifest.json` as it is on disk.
- `read/text.rs` (`frontmatter_string` and `valid_frontmatter`, on `yaml-rust2`) parses frontmatter a second time, next to the specs kernel's `parse_frontmatter` (`crates/kernel/specs/src/document/frontmatter.rs`).

### Requirements

- The rebuild writes every table through one connection and one transaction into a new file next to the database, and moves it over the old one only when everything succeeded. A failure at any step leaves the previous database as it was, or no database when there was none, and a test proves it by failing a step on purpose.
- `manifest.json` is read into a typed struct with the fields today's files hold, and an unreadable manifest is a `StorageError` naming the file. The archive corpus tests still pass.
- Storage reads frontmatter only through the specs kernel, and its own YAML frontmatter reader is removed. Golden rows and corpus tests stay equal.

### Non-goals

- Changing any table's columns or rows.
- Writing `manifest.json`.
