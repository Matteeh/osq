---
title: Rust osq doctor checks locks, archives and done markers
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-config, rust-vcs, rust-specs]
---
## Goal

After a crash or a hand edit, `osq doctor` should find stale locks, broken
archives and done markers that don't match their tasks. Rust doctor checks
only the config and pi, so it can't tell a human why a run is stuck.
TypeScript's `checkLocks`, `checkArchives` and `checkDoneMarkers` in
`src/core/foundation/doctor-changes.ts` print a `locks`, `archives` and
`done-markers` line after the harness lines. This change gives the storage
kernel a typed reader for the files those checks look at, since ADR 022 has
a feature read only through the storage read model. It then has Rust doctor
print the same three lines, across the project's worktrees when vcs is on,
and fail when any of them fails.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic lints
and every Rust test, the corpus link gates included. It proves that the
storage reader reads lock pids, done-marker kinds and proposal and task
presence as TypeScript's checks read them, and that doctor prints
TypeScript's three lines for a healthy project, for each failure, and for a
lock left in an osq worktree. It also proves that every existing doctor
and storage test still passes.

## Non-goals

- Config validity beyond loading, the harness lines of other harnesses, and the containment, validator, managed-block, decision, git, language and price checks.
- Removing a stale lock or fixing a marker; doctor writes no file.
- Changing the doctor command's summary or arguments.

## Surface

- Changed: `osq doctor` (Rust) prints `locks`, `archives` and `done-markers` lines after its config and pi lines, and keeps printing them when the config or the pi binary fails.

## Decisions

- ADR 022: doctor reads lock files, done markers and archive contents only through the new storage reader `read_change_files`, and lists folders with storage's `list_changes`, `change_trees` and `list_tree_changes`; it depends on no feature crate.
- ADR 023: the three lines are pure functions of the storage facts and a liveness answer; only doctor's orchestrator reads files, `/proc`, `HOME` and git.
- ADR 024: every public item ends its doc with `Implements: rust-storage/<requirement>` or `Implements: rust-doctor/<requirement>`, and each test names `Covers: <capability>/<scenario>`.
- ADR 025: the reader reads today's `.run` files as TypeScript writes them; nothing on disk changes.
- ADR 026: done-marker frontmatter splits only through rust-specs `parse_frontmatter`, as rust-storage "One frontmatter reader" requires.
- ADR 027: no scheduling changes.
- ADR 028: `DoctorFeature` keeps its one command, its summary and its refusals.
- ADR 029: no new config keys; doctor falls back to `Config::default()` for the change checks when `osq.toml` fails to load, as TypeScript falls back to `DEFAULT_CONFIG`.

## Assumptions

- A lock's pid is always a JSON integer, as osq writes it. Rust reads a string or fractional `pid` as no pid, so the lock counts as orphaned, where TypeScript's `Number()` would accept `"4242"`.
- A pid is alive when `/proc/<pid>` exists, as the Rust retry feature already checks it. TypeScript's `process.kill(pid, 0)` agrees on Linux, the only platform Rust osq targets today.
- Lock and done-marker names are listed in byte order. TypeScript lists them in the order `readdir` returns, which has no fixed order.
- Printed paths are relative to the root's real path, so a symlinked root prints the same paths as its target. TypeScript resolves the root without symlinks, which only matters when a worktree path and the root differ by a symlink.
- The expected lines come from reading `doctor-changes.ts` and `runDoctorChecks`, not from a TypeScript run, since TypeScript doctor prints many more lines on a scratch root than Rust does.

## Contract

### Requirement: Change checks

See `specs/rust-storage/spec.md`, with "Change folder files", and
`specs/rust-doctor/spec.md`, with "Doctor command", "Doctor pi checks" and
"Doctor change checks".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: ADDED "Change folder files".
- `specs/rust-doctor/spec.md`: MODIFIED "Doctor command" and "Doctor pi checks"; ADDED "Doctor change checks".

No file is shared between tasks.
