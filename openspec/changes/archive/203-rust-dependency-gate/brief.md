---
queue_item: rust-dependency-gate
queue_hash: sha256:1eef78c2ae3c9fed5d9714d0eb03c412e5eca99a27e9e3c23c15b041cd36cbf6
planner: null
date: 2026-10-17
---

### Goal

A task that adds a crate to a Rust project is checked against the denied-dependency rules, as a package added to `package.json` is today.

### Context

As of 2026-10-15:

- `src/watcher/dependencies.ts` reads only `package.json` (`MANIFEST_FILE_NAME`) to find added dependencies.
- Crates are declared in `Cargo.toml` under `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, target-specific tables such as `[target.'cfg(unix)'.dependencies]`, and `[workspace.dependencies]`; a dependency is a `name = "1.0"` line or a table.
- osq's runtime dependencies are `chokidar`, `yaml`, `commander` and `jiti`; adding one needs an ADR (ADR 017 decision 6).

### Requirements

- The gate finds crates added in any `Cargo.toml` a task changed, in every table above, and applies the same rules and dead reason as for npm packages.
- The reader is osq's own, covering only the TOML that dependency tables use, and refuses to guess: a manifest it cannot read fails the gate with a message naming the file, never passes it.
- `LANGUAGE_COVERAGE` lists the denied-dependency gate as covering Rust.

### Non-goals

- A general TOML parser, or a new runtime dependency.
- Version ranges or lock file checks.
