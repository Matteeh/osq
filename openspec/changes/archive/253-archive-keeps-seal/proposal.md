---
title: "Archiving a change leaves its approval seal intact: the archiver ticks only the checkboxes the seal clears"
depends_on: ["248"]
verify: sh scripts/verify-rust.sh
check: pnpm verify
features:
  reads: [rust-storage, spec-lint-and-approve, cli-foundation, status-inspection]
---
## Goal

An archived change's seal should still match its `.run/approved` marker, so
the archive keeps proving what was approved. Today it does not always.
`ensureArchivedTasksTicked` in `src/watcher/archiver.ts` ticks every
`tasks.md` at any depth of the change folder, `*` bullets included, while
`hashChangeFolder` clears ticks only in the root `tasks.md` and only on `-`
bullets. 248 carried a fixture with nested `tasks.md` files; archiving
ticked them, its seal stopped matching its marker, and
`crates/kernel/storage/tests/seal_corpus.rs` failed at land until the two
files were restored by hand.

This change makes both archivers tick only what the seal clears: the root
`tasks.md`, and on it only a `[ ]` after a `-` bullet and one or more spaces
or tabs. Every ticked line is one the seal resets to `[ ]`, so the archived
folder's seal equals its marker. Task 1 changes the TypeScript archiver,
which the watcher runs today, and task 2 the Rust archive feature, its
fixture and its golden tree, so the two stay byte for byte alike. Each
task's test archives a change with a root and a nested `tasks.md` and
checks the archived seal against the marker.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the corpus tests, and the mutation check on the Rust lines this change
touches, which covers the archive feature's tick, golden and seal tests.
The `check` runs `pnpm verify`: the TypeScript typechecks, build, every
test, including `tests/archive-keeps-seal.test.ts` and
`tests/archiver.test.ts`, and lint.

## Non-goals

- Changing the seal, `hashChangeFolder` or `change_folder_seal`; that would change the seal of every approved change in flight.
- Rewriting changes archived before this one.
- Showing archived tasks as done some other way; the done markers in `.run/done/` already say so.

## Surface

None

## Decisions

- ADR 002: archive stays a deterministic step with no model; only what it writes to `tasks.md` narrows.
- ADR 010: the validator still runs at archive as before; nothing it reads or writes changes.
- ADR 012: the watcher picks up the new archiver after `pnpm build` and its supervisor's restart, as for any watcher change.
- ADR 018: a steering planner's edits are archived like any other; only the tick narrows.
- ADR 019: a tapped planner's change is archived the same way.
- ADR 021: autopilot archives through the same archiver, so its archived changes keep their seal too.
- ADR 022: the archive feature keeps its own crate and reads the seal through `osq-kernel-storage`, which its tests already use; no crate dependency changes.
- ADR 023: the root-only read and the bullet rule stay small private functions in `tick.rs`, called from `relocate.rs` as today.
- ADR 024: `folder` keeps `Implements: rust-archive/archive-task-checkboxes`, and the new tests name `Covers: rust-archive/<scenario>`.
- ADR 025: the seal stays byte-compatible; the archive now leaves files the seal covers as the seal expects them.
- ADR 026: the archive's delta merge is untouched; only the tick after the move changes.
- ADR 027: the change locks `crates/features/archive` and touches no file of 251 or 252.
- ADR 028: the archive feature's `Feature` is unchanged.

## Assumptions

- Ticking at archive only serves people reading an archived `tasks.md`; nothing in osq reads it to decide whether a task is done, so leaving `*` bullets and nested files unticked changes no state.
- This change folder holds no nested `tasks.md` and no `*` bullets, so the watcher, which still runs the old archiver when it archives this change, leaves its seal intact.
- The new fixture seal `sha256:9e4011d1…2a37` was computed with TypeScript's `hashChangeFolder` on a copy of the fixture change with the new `notes/tasks.md`.
- `pnpm verify` runs as the `check` because the change-level verify can run only one command, and the Rust script is the one that receives the diff for the mutation check.

## Contract

### Requirement: Archive keeps the approval seal

See `specs/watcher-and-harness/spec.md`.

### Requirement: Archive task checkboxes

See `specs/rust-archive/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: ADDED "Archive keeps the approval seal".
- `specs/rust-archive/spec.md`: MODIFIED "Archive task checkboxes" (root `tasks.md` and `-` bullets only; "Ticked task lines" and "Line starts" kept, "Archived seal matches approval" and "Missing root tasks file" added).

No file is shared between tasks.
