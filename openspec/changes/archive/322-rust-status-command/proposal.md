---
title: Rust osq status prints the status overview
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-vcs, rust-specs, rust-inbox]
---
## Goal

`osq status` is the overview a human reads most after `osq inbox`, and Rust
has no `status` command yet. This change ports it to the show crate, which
already derives each change's status, next step, task lines, sync lines and
land state for `osq show`, across every git tree.

The storage kernel gains the two readers status needs that no Rust code has
yet. `read_watch_state` reads the watcher and service records under
`~/.osq/watch/<hash>`, counting a record only while its pid lives.
`validator_failing` picks the failing validator run, the rule the inbox
crate holds today. The inbox switches to the storage reader so the rule
lives in one place. Then `ShowFeature` gains the `status` command, whose
text equals TypeScript's for the same files: active changes with their
worktree, sync and next-step lines, the archived count and the changes not
landed, rejected changes, the watcher line, and the log, after-land,
validator and autopilot lines.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, corpus tests included. The watcher also runs
cargo-mutants on the touched lines. It proves the watch record table and
the validator table in storage, and that the inbox's validator rows still
hold. It proves that `status` refuses an argument and that its output
equals each of eight TypeScript goldens: the show fixture project, an empty
folder, four watcher states, the pending records and a git project with
worktrees.

## Non-goals

- `osq status` flags; TypeScript's `status` has none.
- The planner, auto-steer and pause records in the next step, which rust-show "Show status and next step" also leaves out.
- Stacked changes beyond what `osq show` prints for them.

## Surface

- Added: Rust `osq status` command.

## Decisions

- ADR 022: `status` reads every file through the storage kernel, the config kernel and the vcs kernel; it calls no other feature, and the validator rule moves from the inbox feature into storage so both features read it there.
- ADR 023: the status text is built by pure functions over read facts; one orchestrator loads the config, asks git and reads the records.
- ADR 024: every public item ends its doc with `Implements: rust-storage/<requirement>` or `Implements: rust-show/<requirement>`, and each test names `Covers: <capability>/<scenario>`.
- ADR 025: the watch records, markers and event streams are read as TypeScript writes them; nothing on disk changes.
- ADR 026: the rejected marker's frontmatter is read only through rust-specs `parse_frontmatter`.
- ADR 027: no scheduling changes.
- ADR 028: `ShowFeature` stays a unit struct and lists one more `Command`.
- ADR 029: `status` reads `osq.toml` through `load_config` only, and adds no key.

## Assumptions

- A process is live when `/proc/<pid>` exists, as the inbox and retry crates already decide; TypeScript's `kill(pid, 0)` gives the same answer on Linux.
- Every golden was printed by `golden/print-status-goldens.mjs.txt` with the built `dist` of this repository on 2026-10-24.

## Contract

### Requirement: Watch state records

See `specs/rust-storage/spec.md`, ADDED "Watch state records".

### Requirement: Validator failing record

See `specs/rust-storage/spec.md`, ADDED "Validator failing record".

### Requirement: Status command

See `specs/rust-show/spec.md`: MODIFIED "Show command", ADDED "Status
command" and ADDED "Status text equals TypeScript's".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: ADDED "Watch state records" and "Validator failing record".
- `specs/rust-show/spec.md`: MODIFIED "Show command", its scenario updated for the third command; ADDED "Status command" and "Status text equals TypeScript's".
- No file is shared by two tasks.
