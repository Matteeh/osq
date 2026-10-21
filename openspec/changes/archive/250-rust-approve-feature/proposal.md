---
title: The approve feature seals a planned change and writes its approval marker in the checkout, as osq approve does without worktrees
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: ["rust-core", "rust-storage", "rust-specs"]
---
## Goal

Approval is the human's gate. `crates/features/approve` is a placeholder.
This change gives it `approve <id>`: find the active change as
`findChange` does, refuse an approved change that needs steering, validate
its delta specs with the specs kernel, and write `.run/approved` with the
seal TypeScript writes, so a Rust loop can trust an approval it did not see
happen.

Task 1 builds the feature: the arguments, the lookup, the steering
refusal, the marker and the output, with a golden test against markers
TypeScript's `approveSpec` wrote. Task 2 adds the validation refusal on the
specs kernel's checks.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the corpus tests, and the mutation check on the lines this change touches.
That covers the approve feature's tests on repositories each test builds
under `CARGO_TARGET_TMPDIR` and the golden test that compares the markers
`approve` writes on the golden fixture with the ones TypeScript wrote.

## Non-goals

- Worktrees, branches, stacking, steering approvals and the default-branch paths; they need config and worktree reads in Rust. A change that needs steering is refused instead.
- `osq lint`'s full rule set (task files, scope, verify commands, ownership, words); only the specs kernel's delta and merged validation runs.
- The approval digest, notices, flags and `--confirm`, planning-session observation, price gaps, and `.run/manifest.json`, which record config, harness and model facts.
- The live-planner refusal for a planner started with `osq plan --run`, which Rust does not start yet.
- Approving several ids in one run, and CLI wiring.

## Surface

None

## Decisions

- ADR 022: `osq-feature-approve` depends only on `osq-core`, `osq-kernel-storage` and `osq-kernel-specs`; it finds and reads change folders through storage's `list_changes`, `read_change` and `change_folder_seal`, and validates through the specs kernel. It writes only the change's `.run/approved`.
- ADR 023: the lookup match, the steering triggers, the refusal texts and the output are pure private functions over plain values; `ApproveFeature::run` and one orchestrator alone do IO.
- ADR 024: every public function's doc and every function that implements a requirement ends with `Implements: rust-approve/<requirement>`, and every test names `Covers: rust-approve/<scenario>`.
- ADR 025: the marker is today's `.run/approved` with the byte-compatible seal, and with no `osq.toml` the command behaves as TypeScript's in-place approval under `DEFAULT_CONFIG`.
- ADR 026: validation runs only through the specs kernel's `validate_change` and `validate_merged_change`, never the Node `openspec` CLI.
- ADR 027: the feature decides nothing about scheduling.
- ADR 028: the crate's one public item is `ApproveFeature`, a unit struct implementing `Feature` with the name `approve` and one command `approve`.

## Assumptions

- The brief asked that re-approving an unchanged change be a no-op and that a change whose files changed since approval get TypeScript's message. TypeScript's in-place `approveSpec` has no such message: it writes the current seal again, which leaves an unchanged marker byte for byte the same and reseals a changed folder. Rust does the same.
- The validation refusal keeps TypeScript's wrapper, `Lint failed for spec "<folder>":` and one `  - ` line per problem, but its lines are the specs kernel's findings, which pass and fail as `openspec validate` does (rust-specs "OpenSpec validate parity") but are worded in osq's own terms, so they are not TypeScript's text.
- A change that needs steering is refused with a Rust-only message instead of being approved and having its triggers retired, as TypeScript does; retiring triggers writes events and markers the steering path owns.
- A query with a sign, such as `-1`, matches as text only; TypeScript's `parseInt` would pad `-1` to `0-1`, which names no folder either.
- 248 showed that the watcher's archiver ticks every nested `tasks.md` in a change folder, which changes its seal (queued as `archive-keeps-seal`). This change folder therefore holds no file named `tasks.md`: each fixture change's is stored as `tasks-md.txt`, and task 1 copies it to the crate under its real name.
- Task 1 adds `osq-kernel-specs` with `osq-kernel-storage` although only task 2 uses it, so only task 1 scopes `Cargo.toml` and `Cargo.lock`; `Cargo.lock` is shared with every other change that adds a crate dependency.

## Contract

### Requirement: Approve feature

See `specs/rust-approve/spec.md`.

### Requirement: Approve arguments

See `specs/rust-approve/spec.md`.

### Requirement: Approve lookup

See `specs/rust-approve/spec.md`.

### Requirement: Steering refusal

See `specs/rust-approve/spec.md`.

### Requirement: Approve validation

See `specs/rust-approve/spec.md`.

### Requirement: Approval marker

See `specs/rust-approve/spec.md`.

### Requirement: TypeScript approval parity

See `specs/rust-approve/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-approve/spec.md`: ADDED "Approve feature", "Approve arguments", "Approve lookup", "Steering refusal", "Approve validation", "Approval marker" and "TypeScript approval parity".

The change folder holds the inputs task 1 copies byte for byte:
`fixture/golden/` is the golden fixture repository, with each change's
`tasks.md` stored as `tasks-md.txt`, and `golden/<folder>.approved` is the
`.run/approved` TypeScript's `approveSpec` wrote for each of its changes
under `DEFAULT_CONFIG` on a copy with those files renamed.

Tasks 1 and 2 share `crates/features/approve/src/approve.rs`, which task 2
extends to validate before sealing, and
`crates/features/approve/src/approve/lint.rs`, which task 2 creates inside
task 1's `src/approve/*.rs` glob; task 2 runs after task 1.
