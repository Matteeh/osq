---
queue_item: rust-toolchain-pin
queue_hash: sha256:dd7fd0c725269ecec139fbc3b8123bfe49db954176f77521ff4af920e2a1b919
planner: null
date: 2026-10-20
---

### Goal

A Rust change that passes verify on one machine passes everywhere. Clippy's pedantic lints change between Rust releases, so an unpinned toolchain makes main red or green depending on who runs it.

### Context

As of 2026-10-19:

- The repository has no `rust-toolchain.toml`. `.github/workflows/rust.yml` installs `dtolnay/rust-toolchain@stable` in three jobs. Local rustup stable is 1.99.1 and passes `cargo clippy --workspace --all-targets -- -D warnings`.
- Clippy 1.97 fails main on the word `SQLite` in doc comments (pedantic `doc_markdown`), while CI on unpinned stable passes.
- The watcher runs Rust verifies with the `cargo` first on its PATH. `~/.local/bin/cargo` there is a copied binary, not a rustup proxy, so it ignores a toolchain file (Rust roadmap housekeeping row "Remove the ~/.local/bin shims").
- `tests/rust-ci.test.ts` pins the workflow's steps. A change that edits it must run `pnpm verify` (Bugs and incidents: "Rust change landed TypeScript lint errors").
- `Cargo.toml` sets `rust-version = "1.85"`, the minimum supported version, which is a separate thing from the toolchain that lints the code.

### Requirements

- `rust-toolchain.toml` pins one exact stable version with the `clippy` and `rustfmt` components, and every Rust job in CI installs that same version, read from the file rather than written twice.
- The workspace passes `sh scripts/verify-rust.sh` on the pinned version; any lint it raises is fixed in the code, never allowed.
- `osq doctor`, or the verify script, says clearly when the `cargo` on PATH is not the pinned version.
- The change's verify or check runs `pnpm verify`, because it edits a TypeScript test.

### Non-goals

- Raising `rust-version`, or testing the minimum supported version in CI.
- Removing the `~/.local/bin` shims; a human does that on the machine.
