---
queue_item: rust-test-gate
queue_hash: sha256:5db212da0cceae5692e05f3cb2b4fa82fb6c9d2d1af2cd6e13b11d574f2d5fad
planner: null
date: 2026-10-17
---

### Goal

An executor on a Rust project cannot weaken a preexisting test without `tests.modify: true`, the same as on TypeScript. Today the gate protects only the root `tests/` folder, so a workspace crate's tests and every inline test module go unguarded.

### Context

As of 2026-10-15:

- `isGatedTestPath` in `src/core/run/test-gate.ts` gates `tests` and paths under `tests/` at the repository root only. `isTestPath` in `src/core/trace/test-path.ts` is a second rule for traceability.
- Rust keeps integration tests in `tests/` beside each crate's `Cargo.toml` (for example `crates/core/tests/`), and unit tests in `#[cfg(test)] mod tests { … }` inside source files.
- ADR 017: a path's language comes from its nearest manifest; facts are data in `LANGUAGE_PRESETS` (`src/kernel/languages/presets.ts`); reading code sits behind the languages adapter; `LANGUAGE_COVERAGE` says which languages each gate covers.

### Requirements

- The Rust preset gains its test file facts as data: the `tests/` folder beside each `Cargo.toml`, and `benches/`.
- The frozen-test gate protects those paths for Rust, found through each path's nearest manifest.
- A change to a preexisting Rust file that edits or removes lines inside a `#[cfg(test)]` module counts as a test change. The languages adapter gains the one method that finds those line ranges, with osq's own reader and no new dependency.
- `LANGUAGE_COVERAGE` lists the test-modification gate as covering Rust; the language gap notice for Rust drops it.
- TypeScript behaviour is unchanged.

### Non-goals

- Python and Go.
- Traceability's `isTestPath` for Rust.

### Notes for planning

- Prove it with a tiny Cargo workspace fixture of two crates; no test may need `cargo` installed.
