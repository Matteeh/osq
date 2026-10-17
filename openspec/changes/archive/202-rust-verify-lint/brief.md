---
queue_item: rust-verify-lint
queue_hash: sha256:5b2204fbcb9172b5b332be5fe62836aa0e4c1660b42c4899e5e9411658423a17
planner: null
date: 2026-10-17
---

### Goal

A Rust project's task verify, such as `cargo test -p core --test parse`, lints clean, and the chained-verify error tells a Rust project what to do instead of naming package scripts it doesn't have.

### Context

As of 2026-10-15:

- The verify-command analysis in `src/core/spec/linter.ts` warns when a command names "neither an existing repository path nor a package script", which every `cargo` command does today.
- Chained verifies are refused with advice to move the chain into a package script.
- `LANGUAGE_COVERAGE` lists verify-command lint as TypeScript only.

### Requirements

- In a project with a `Cargo.toml`, `cargo` with the subcommands `test`, `nextest`, `build`, `check`, `clippy`, `fmt` and `run` is a recognized runner, so no warning.
- The chained-verify refusal suggests a script file in the repository (for example `scripts/verify.sh`) when the project has no `package.json`.
- `LANGUAGE_COVERAGE` lists verify-command lint as covering Rust.

### Non-goals

- Checking that a named test target exists.
