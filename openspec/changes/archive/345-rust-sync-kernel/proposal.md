---
title: Rust's default-branch sync lives in a kernel crate that land, approve, run and archive call
depends_on: []
verify: sh scripts/verify-rust.sh
creates:
  - name: rust-sync
    group: rust
features:
  reads: [rust-land, rust-core]
---
## Goal

Taking the default branch into a change's branch is shared work. Land does
it today, approve needs it to recover a default-branch stop, and the Rust
loop's run and archive gates will need it before spawn and before archive
(Loop design brief, 2026-10-24). The code sits in the land feature
(`crates/features/land/src/land/sync.rs` and the 12 modules under
`sync/`), and features never call each other (ADR 022), so no other
caller can reach it.

This change moves that code, unchanged in what it does, into a new kernel
crate `osq-kernel-sync` in `crates/kernel/sync`, the capability
`rust-sync`. Its one entry point, `sync_change`, returns a typed outcome:
already synced, synced with its commit, or a `SyncStop` holding the
reason, the message and, for a conflict, the conflicted paths. Rust-first
`conflict-reruns-owning-tasks` needs those paths to reopen only the tasks
that own them (326). The caller chooses whether a stop is recorded,
whether verify runs and which done tasks it verifies. `osq land` and
`osq sync` call the kernel and behave byte for byte as before. ADR 022's
kernel list gains `sync`.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the corpus tests, and the mutation check on the lines this change touches.
Every land test passes unchanged, which proves `osq land` and `osq sync`
behave as before, and the new kernel's tests prove the outcome, the
options and the stopped event. Task 2's verify proves ADR 022 lists the
kernel and every Rust ADR still reads as accepted.

## Non-goals

- Changing what sync does; this is a move, plus the two options no caller turns off yet.
- The approve, run and archive callers; `rust-approve-default-branch-steering` and the loop add them.
- Moving the sync requirements out of rust-land; they keep describing what `osq land` and `osq sync` do, and the moved code keeps its `Implements: rust-land/...` tags.
- A merge agent.
- Changing TypeScript.

## Surface

None

## Decisions

- ADR 022: the sync kernel is a kernel crate on core and the config, harnesses, specs, storage and vcs kernels; land depends on it, and no kernel depends on a feature. Task 2 adds `sync` to the ADR's two kernel lists, and `config`, which ADR 029 added without updating them.
- ADR 023: `sync_change` is the thin orchestrator over the moved step modules; the stop, the outcome and the options are plain values.
- ADR 024: every new public function's doc ends with `Implements: rust-sync/<requirement>`, the moved functions keep their rust-land tags, and every kernel test names `Covers: rust-sync/<scenario>`.
- ADR 025: the sync writes the same files, events and commits as before.
- ADR 026: the sync keeps using the specs kernel's delta parse and merge.
- ADR 027: the change locks `crates/kernel/sync`, the land crate's sync files and the root `Cargo.toml`, so it waits for any running change in the land crate.
- ADR 028: no feature is added; `LandFeature` keeps its commands.
- ADR 029: the kernel takes `VcsConfig`, `Timeouts` and `Limits` from its caller and reads no config itself.
- ADR 030: no reaction is involved; a caller runs the sync inside its own command, because its result decides the command's outcome.

## Assumptions

- The move keeps git's rename detection: a trial in a scratch clone on 2026-10-25 showed all 13 moved files as renames (11 identical, 2 at 96% and 98%), so the mutation check tests only the lines the move changes, which the kernel's own tests cover.
- The sync requirements stay in rust-land and the kernel's spec points at them, so no land test or tag changes; a later change can move them once a second caller exists. Lint therefore warns that task 1 scopes rust-land files without a rust-land delta; what land does is unchanged.
- `time.rs` is copied into the kernel, as every Rust crate keeps its own, with the fixed-times test the manual feature uses.

## Contract

### Requirement: Sync change

See `specs/rust-sync/spec.md`.

### Requirement: Sync options

See `specs/rust-sync/spec.md`.

### Requirement: Sync stopped event

See `specs/rust-sync/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-sync/spec.md` (new capability): ADDED "Code ownership", "Sync change", "Sync options" and "Sync stopped event".
- No file is shared between tasks.
