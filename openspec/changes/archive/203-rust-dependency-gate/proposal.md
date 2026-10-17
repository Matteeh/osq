---
title: The denied-dependency gate reads Cargo.toml
depends_on:
  - 202
verify: pnpm verify
features:
  reads:
    - status-inspection
---
## Goal

A task that adds a crate to a Rust project is checked against the
denied-dependency rules, as a package added to `package.json` is today. Today
the gate reads only `package.json`, so a crate added to any `Cargo.toml` goes
unchecked. After this change the Rust language adapter gains osq's own
`Cargo.toml` reader. It finds crates in every dependency table, follows
`package = "..."` renames, and refuses to guess on TOML it cannot read. The
watcher's baseline and comparison read scoped `Cargo.toml` files through it,
an unreadable manifest fails the gate with a message naming the file, and the
coverage list says the gate covers Rust.

## Verify

`pnpm verify`

The CLI and UI typechecks, the build, every test and lint pass on the final
tree, including the two new test files: one runs the reader over the
scenario's manifests, the other runs `runTask` on temporary projects with a
scoped `crates/core/Cargo.toml`. No test needs `cargo`.

## Non-goals

- A general TOML parser, or a new runtime dependency.
- Version ranges, lock file checks, or features.
- Cargo's `[patch]` and `[replace]` tables, and dependencies declared outside a `Cargo.toml` the task scopes.
- Python and Go manifests.
- Moving the `package.json` reader behind the adapter; it stays in `src/watcher/dependencies.ts` (ADR 017 decision 7).

## Surface

- Changed: `denied_dependency` dead markers can start `osq cannot read the dependency tables of these manifests:`, for a scoped manifest the reader cannot read while some accepted ADR denies a name.
- Changed: the `dependencies` of `measures` start events and the `dependencies_added` events can name `Cargo.toml` files.
- Changed: the `languages` `osq doctor` check passes without a warning for Rust, and the `language_gap` approval notice no longer fires for Rust.

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
- ADR 017: reading `Cargo.toml` is a second adapter method, `manifestDependencies`, because Rust's manifest format really differs (decision 5). The reader is osq's own code (decision 6). The gate finds a manifest's language from the presets (decision 2), and the coverage list moves only when the gate covers Rust (decision 4). A gate never passes on a manifest it cannot read, so an unreadable one fails (decision 4).

## Assumptions

- This change builds on 202, which adds the verify runners column and moves verify-command lint to cover Rust. Its MODIFIED "Language presets and coverage" repeats 202's text, so 202 must land first.
- A manifest that was unreadable at the baseline maps to no names. If the task leaves it readable, every crate in it counts as added and is checked against the denials.
- An unreadable manifest fails the task only while some accepted ADR denies a name. osq's own repository has one, ADR 020, so here an unreadable scoped `Cargo.toml` fails the task. `denied_dependency` deaths are retried automatically, and the next prompt carries the marker that names the file.
- Measured on 2026-10-17: a scratch prototype of the reader returned every row of "Crates a manifest declares" in 173 lines. A grep of tests for the coverage text found only `tests/languages-map.test.ts`, `tests/doctor-languages.test.ts` and `tests/notices-language.test.ts`, which task 3 updates.

## Human steps

### Before approval

- Land 202 first.

### After landing

None

## Delta

- `specs/languages/spec.md`: MODIFIED "Language presets and coverage" (denied-dependency gate covers Rust, Python row in the scenario); ADDED "Manifest dependencies".
- `specs/watcher-and-harness/spec.md`: MODIFIED "Dependency baseline", "Dependencies added", "Denied dependency" (Cargo manifests, unreadable manifests).
- `specs/spec-lint-and-approve/spec.md`: MODIFIED "Language gap notice" (no notice for Rust, Python scenario).
- `specs/cli-foundation/spec.md`: MODIFIED "Languages doctor check" (Rust passes without a warning, Python scenario).

No file is shared between tasks. Task 2 reads task 1's adapter and the presets without changing them.
