---
queue_item: rust-cli-run
queue_hash: sha256:bed7fb56b26425acbf6607965d9bc6f098c08316c9675efe2aea371ca5aa8a76
planner: null
date: 2026-10-22
---

### Goal

`rust-run-one-task` adds `RunFeature` but leaves it out of the CLI registry, because 271 was editing that registry at the same time. Until it is registered, the Rust binary has no `osq run`.

### Context

As of 2026-10-22:

- `features()` in `crates/apps/cli/src/lib.rs` registers every feature in order; 271 appended show, lint, doctor and retry after report. `crates/apps/cli/Cargo.toml` already depends on `osq-feature-run`.
- `RunFeature` is a unit struct in `crates/features/run/src/feature.rs` with one `run` command (273). The CLI's dispatch tests are in `crates/apps/cli/tests/dispatch.rs`.

### Requirements

- `features()` registers `RunFeature`, and the binary's top-level help lists `run` with its summary.
- `osq run <id> <task>` through the CLI reaches the run feature: a test runs it on a root with no `openspec/` folder and gets the feature's own error, not an unknown-command error.

### Non-goals

- Any change to how the run feature runs a task.
