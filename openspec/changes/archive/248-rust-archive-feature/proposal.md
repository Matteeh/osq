---
title: The archive feature applies a done change's deltas to the living specs and moves it to the archive, as the watcher's archiver does
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-specs, rust-storage]
---
## Goal

Archiving is the moment specs change, and `crates/features/archive` is a
placeholder. This change gives `osq-feature-archive` its `ArchiveFeature`,
whose one command, `archive <change>`, does in Rust what TypeScript's
`archiveSpecFolder` does: given an active change that still matches its
approval seal and whose tasks are all done, it merges its delta specs
with the specs kernel's `merge_change`, writes the living specs and sidecars, removes `plan-prompt.md`, moves the folder
under `openspec/changes/archive/` and ticks its `tasks.md` checkboxes,
leaving the same files and bytes as TypeScript. It writes TypeScript's
archive record first and puts the living files back from it when a write
fails. A change that is not done, or whose deltas do not apply, is refused
with TypeScript's merge message and nothing is written. A golden test
archives a fixture change and compares the tree with the one TypeScript
produced.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the corpus tests, and the mutation check on the lines this change touches.
That covers the feature's name, commands and argument errors, the refusals
that write nothing, the living spec and sidecar writes, the move and its
name suffixes, the ticked checkboxes, the golden tree, and the record and
its put-back on a failed write.

## Non-goals

- The archive verify run, the scope recertification audit, the validator, git commits and the `archived` event; the loop and the run feature own them.
- Restoring a record that a stopped archive left; `archive` refuses such a change instead.
- Any CLI, server or loop wiring; no app registers the feature yet.
- A legacy change folder with `spec.md` in place of `proposal.md`; its `creates` is not read.
- Any change to the specs or storage kernels, core, or TypeScript's archiver.

## Surface

None

## Decisions

- ADR 022: `osq-feature-archive` depends on `osq-core`, `osq-kernel-specs` and `osq-kernel-storage`, never on another feature; it finds the change, its fold and its seal through the storage kernel's `list_changes`, `read_change` and `change_folder_seal`, merges only through the specs kernel, and passes core's typestate gates, `Change::approve` then `Change::archive`, before it writes anything, as "gates are types" says.
- ADR 023: `run` is a thin orchestrator over small named steps (find, check, merge, write, record, move, tick); the line-start and checkbox rules are pure private leaves, and every item has a doc comment.
- ADR 024: every public function's doc ends with `Implements: rust-archive/<requirement>`, and every test's doc names `Covers: rust-archive/<scenario>`.
- ADR 025: the feature reads and writes today's `openspec/` layout as it is: the same living files, the same `archive-specs.json` record, and the same archive folder names as TypeScript.
- ADR 026: the delta merge is the specs kernel's `merge_change`; the feature parses no OpenSpec markdown itself and only reads `creates` from the frontmatter `parse_frontmatter` gives.
- ADR 027: the change touches only the archive crate and `Cargo.lock`, so it locks no other crate.
- ADR 028: `ArchiveFeature` is the crate's one public item, a unit struct with no state, and it builds every core value through its constructors.

## Assumptions

- `Cargo.lock` must change: task 1 adds `osq-kernel-specs`, `osq-kernel-storage`, `serde_json` and `yaml-rust2`, all already workspace dependencies, to the archive crate, so it scopes the root `Cargo.lock`. 244-rust-inbox-feature also scopes `Cargo.lock`, so the two do not run side by side.
- A change is archived only when its `.run/approved` seal equals the seal of its folder now, core's `Change::archive` finds its fold done, and every task has its `.run/done/<n>` marker. TypeScript checks no seal at archive and reads markers only; the seal check comes with core's typestate, and asking for the markers too refuses a change either osq would not call done. Nothing osq writes to a change folder after approval is in the seal: `.run/`, `plan-prompt.md` and `tasks.md` checkboxes are left out, and a steered change is approved again.
- TypeScript has no message for a change it does not archive (`checkAndArchiveSpec` returns false), so `<folder> is not approved`, `<folder> changed since it was approved`, `<folder> is not done`, `no active change <argument>` and the usage text are new. The merge refusals use TypeScript's `DeltaMergeError` messages, which the specs kernel's `MergeError` already writes.
- TypeScript's `applyOpenSpecDeltas` writes the deltas before the one that fails; the planner checked that on the fixture. Rust merges every delta before writing, so a refused change writes nothing, as the brief asks.
- The archive record is kept so that a crash mid-archive leaves what TypeScript's `restoreArchiveSpecs` can restore. Putting files back from it inside `archive` when a write fails is new; it is what makes the record's contents testable, and the mutation check needs that.
- `golden/project/` was produced by the planner with TypeScript's `archiveSpecFolder` from this checkout's `dist/` build, at commit 1005c2c3, on a copy of `fixture/project/`, after which the `.run/events/change.jsonl` holding only the `archived` event was deleted. The planner also checked that the specs kernel's `merge_change` gives the golden's `alpha`, `beta` and `gamma` texts, and that `read_change` gives the fixture change the status `Done` with both done markers.
- The fixture change's `.run/approved` holds the seal TypeScript's `hashChangeFolder` gives its folder, and the planner checked that `change_folder_seal` gives the same. A test that edits a sealed file of it writes the new `change_folder_seal` to `.run/approved` first.
- The fixture's `.run/` files in this change folder are not covered by this change's own approval seal, which skips `.run` segments; tasks 1 and 2 copy them as they are.

## Contract

### Requirement: Archive feature

See `specs/rust-archive/spec.md`.

### Requirement: Archive arguments

See `specs/rust-archive/spec.md`.

### Requirement: Change lookup

See `specs/rust-archive/spec.md`.

### Requirement: Archive gates

See `specs/rust-archive/spec.md`.

### Requirement: Archive merge

See `specs/rust-archive/spec.md`.

### Requirement: Living spec writes

See `specs/rust-archive/spec.md`.

### Requirement: Archive sidecars

See `specs/rust-archive/spec.md`.

### Requirement: Archive move

See `specs/rust-archive/spec.md`.

### Requirement: Archive task checkboxes

See `specs/rust-archive/spec.md`.

### Requirement: Archive parity

See `specs/rust-archive/spec.md`.

### Requirement: Archive record

See `specs/rust-archive/spec.md`.

### Requirement: Archive put-back

See `specs/rust-archive/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-archive/spec.md`: ADDED "Archive feature", "Archive arguments", "Change lookup", "Archive gates", "Archive merge", "Living spec writes", "Archive sidecars", "Archive move", "Archive task checkboxes", "Archive parity", "Archive record" and "Archive put-back".

The change folder holds the inputs tasks copy byte for byte: `fixture/project/`
is the fixture project, `.run/` folders included, and `golden/project/` the
tree TypeScript left after archiving it.

Shared files: task 1 owns `crates/features/archive/src/*.rs`, writes
`src/lib.rs` with every module once, and leaves `src/relocate.rs`,
`src/tick.rs` and `src/record.rs` as one-line module docs. Task 2 fills
`src/relocate.rs` and `src/tick.rs` and extends `src/feature.rs`; task 3
fills `src/record.rs` and extends `src/archive.rs`. So each shared file has
one owner and one extender. Tasks 2 and 3 use `tests/support/mod.rs`, task 2
also `tests/reseal/mod.rs`, and both use `tests/fixtures/project/`, which
task 1 writes, without changing them.
