---
queue_item: rust-cli-dispatch
queue_hash: sha256:d9b774171acbd746277d8aef9c37ca7f15af2b0a5bbb72cb4e131011b516761a
planner: null
date: 2026-10-21
---

### Goal

`crates/apps/cli/src/main.rs` is an empty `fn main() {}`, so no Rust feature can be run from a shell. The binary should list every registered feature's commands, parse the arguments each command declares, run it and print its output with the right exit code, as ADR 028 sets out.

### Context

As of 2026-10-21:

- `osq-cli` already depends on every feature crate. Plan, approve, archive, land, inbox and report each expose one `Feature` (ADR 028) giving its name, its commands as data and a function that runs one command to output or a typed error. Run and metaloop are still placeholders.
- TypeScript's command tree is `createProgram` in `src/cli/index.ts`, on `commander`.

### Requirements

- `osq <command> [args]` runs the feature command of that name, prints its output to stdout, and exits 0; a typed error prints to stderr and exits non-zero, with the same text TypeScript prints for the same error where the feature already matches it.
- `osq --help` and `osq <command> --help` list commands and arguments from the features' data, never from a hand-kept list.
- Tests run the built binary on fixture projects for at least query, inbox and report.

### Non-goals

- JSON output, shell completion, and server forwarding.
- Commands whose features do not exist yet.
