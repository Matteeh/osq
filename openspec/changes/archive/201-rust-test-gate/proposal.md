---
title: The frozen-test gate protects a Rust project's tests, in each crate's tests folder and in test modules
depends_on: []
verify: pnpm verify
features:
  reads:
    - status-inspection
    - version-control
---
## Goal

An executor on a Rust project cannot weaken a preexisting test without
`tests.modify: true`, the same as on TypeScript. Today the frozen-test gate
protects only the root `tests/` folder, so a workspace crate's
`crates/<name>/tests/` and every `#[cfg(test)] mod tests { … }` inside a source
file go unguarded. After this change the Rust preset names its test folders as
data, the runner snapshots them through each path's nearest manifest, a new
languages adapter finds inline test modules with osq's own reader, lint flags a
crate test scoped without `tests.modify`, and the coverage list says the gate
covers Rust.

## Verify

`pnpm verify`

The CLI and UI typechecks, the build, every test and lint pass on the final
tree, including the four new test files, which drive a two-crate Cargo
workspace written into a temporary git project. No test needs `cargo`.

## Non-goals

- Python and Go.
- Traceability's `isTestPath` for Rust.
- New test files in a crate's `tests/`: the git guard's scope exemption and task commit's new-test pickup stay on the root `tests/`, so a task scopes the new crate test files it writes.
- The frozen-test reach warning, the approval digest's test list and the change-verify rerun's unrelated-failure check stay on the root `tests/`; they read the TypeScript import graph or node:test output.
- A whole file that `#[cfg(test)] mod tests;` points at, other `cfg` forms such as `#[cfg(all(test, unix))]`, and `#[cfg(test)]` on items other than a `mod`.
- TypeScript packages' own `tests/` folders, such as `packages/ui/tests/`: TypeScript gains no test folders, so TypeScript behaviour is unchanged.

## Surface

- Changed: `undeclared_test_change` dead markers can name the new state `test module modified`.
- Changed: the `languages` `osq doctor` check and the `language_gap` approval notice no longer list `test-modification gate` for Rust.

## Decisions

- ADR 001: config loading is untouched.
- ADR 002: archive replays the deltas as usual.
- ADR 004: the OpenSpec validator invocation is untouched.
- ADR 005: the peer range rule is untouched.
- ADR 010: the validator role is untouched.
- ADR 012: the watch service is untouched.
- ADR 015: `osq mcp` is untouched.
- ADR 018: the steering planner is untouched.
- ADR 019: the tapped planner is untouched.
- ADR 021: autopilot is untouched.
- ADR 017: the Rust test folders are preset data (decision 2); the gate finds them through each path's nearest manifest (decision 1); the first adapter method, `testModuleRanges`, exists because Rust needs it and TypeScript has none (decision 5); the reader is osq's own code (decision 6); and the coverage list moves only when the gate covers Rust (decision 4).

## Assumptions

- The inline-module gate reads the tracked files `readLanguageMap` lists. Without git, as with ADR 017's map today, osq sees only root manifests, so it gates a root crate's `tests/` and `benches/` but no test modules.
- Reformatting a test module, such as a rustfmt run that changes indentation, counts as editing it. A task that reformats Rust code with tests in it needs `tests.modify: true` and the file in scope.
- Adding lines inside a test module is not a change, so an executor may add tests to an existing `mod tests` without `tests.modify`, as it may add a new test file.
- The snapshot reads every tracked Rust source once per task. On a large Rust project this adds a read of each `.rs` file before spawn; no cache is added.
- Measured on 2026-10-17: a prototype of all four tasks in a scratch worktree typechecked and passed lint. Its runner and lint rows matched every table row, and the full suite failed only the three tests that pin the coverage text, which task 4 updates.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/languages/spec.md`: MODIFIED "Language presets and coverage" (test folders column, gate covers Rust); ADDED "Test folders and paths of a map", "Inline test modules".
- `specs/watcher-and-harness/spec.md`: MODIFIED "Test modification gating" (test folders, test modules, `test module modified`), "Test gate paths" (`gatedTestPathFilter`, the snapshot moves to `src/core/run/test-snapshot.ts`).
- `specs/spec-lint-and-approve/spec.md`: MODIFIED "Test modification declaration validation" (crate tests), "Language gap notice" (scenario detail).
- `specs/cli-foundation/spec.md`: MODIFIED "Languages doctor check" (scenario message).

Shared file: `src/kernel/languages/presets.ts`. Task 1 adds the test folders; task 4 changes the coverage list after it. Task 1's test does not read the coverage list, so the watcher recertifies task 1 by itself.
