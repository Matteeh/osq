---
title: Rust computes the approval seal byte for byte as TypeScript does, so a change approved by TypeScript osq verifies under Rust
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: []
---
## Goal

ADR 025 section 3 says the approval seal stays byte-compatible: a change that
TypeScript osq approved must still verify under Rust osq. Today Rust can only
parse and compare a seal (`Seal::parse` in `crates/core/src/seal.rs`). It
cannot compute one. This change ports `hashChangeFolder` and
`normalizeTasksMd` from `src/core/spec/hasher.ts`:

- Core gains `compute_seal`, a pure function from (path, bytes) entries to a
  `Seal`, with a new `sha2` dependency.
- Storage gains `change_folder_seal`, which walks a change folder with ADR
  025's exclusions and asks core for the seal.

The expected seals all come from TypeScript. The planner ran
`hashChangeFolder` on 2026-10-19 over fixture folders, which are committed in
this change folder under `seal-fixtures/` with their seals in
`seal-fixtures/seals.json`, and over the entry lists in the rust-core
scenarios. The tests never run node.

The same run hashed every archived change. 193 of the 218 folders with a
`.run/approved` marker match it (measured again after 222 landed). The 25 that don't, 002 to 016 and 018 to 027,
were all rewritten after approval by change 028's commit (`9c3b03ba`, "016
completion: pinned validator, spec re-seed, writes removal, OpenSpec
alignment"). 001 has no marker. The corpus test pins exactly that list.

This replans rejected change 221 unchanged, apart from this count. 221 died
because `OSQ_DIFF` octal-quoted the non-ASCII paths under
`seal-fixtures/unicode-order/`, and cargo-mutants could not parse the diff.
222 made osq write those paths raw.

## Verify

`sh scripts/verify-rust.sh`

It runs the Rust format check, clippy with pedantic lints, every Rust test,
the new corpus test `crates/kernel/storage/tests/seal_corpus.rs` included, and
the mutation check on every Rust line the change touched. No TypeScript file
changes, so `pnpm verify` is not needed.

## Non-goals

- The other `manifest.json` hashes (AGENTS.md, PLANNER.md, config,
  capabilities and sidecars). They are computed by other functions.
- Writing `.run/approved`, or an approve or verify command in Rust.
- Following symbolic links. `hashChangeFolder` leaves them out, and so does
  Rust.
- Any change to the TypeScript hasher.

## Surface

None

## Decisions

- ADR 022: `compute_seal` is pure and lives in core; the folder walk, the only IO, lives in the storage kernel.
- ADR 023: small named functions, the UTF-16 ordering and the checkbox reset each in their own leaf, a doc comment on every item, no loosened lint.
- ADR 024: every public function ends its doc with `Implements: rust-core/seal-computation` or `Implements: rust-storage/<requirement>`, and every test names `Covers: <capability>/<scenario>`.
- ADR 025: the seal is computed exactly as section 3 says, so a TypeScript-approved change verifies under Rust.
- ADR 026: OpenSpec handling is not touched.

## Assumptions

- `sha2` 0.11 (0.11.1 was the newest on crates.io on 2026-10-19) builds with the workspace's `rust-version = "1.85"`. No accepted ADR denies it, so the dependency gate records it and lets the task go on. The executor of task 1 fetches it, so `Cargo.lock` and the local registry hold it before the watcher's verify runs.
- Rust's `String::from_utf8_lossy` replaces invalid UTF-8 the way Node's `utf8` decoder does: one U+FFFD per maximal invalid subpart. The `undecodable` rows check this, and Python's decoder gave the same seal as TypeScript for `FF FE 41`.
- Git keeps the fixture files byte for byte. `.gitattributes` sets `text=auto eol=lf`, so no fixture holds CRLF: the CRLF cases are core rows or are written at test time. `.DS_Store` is in `.gitignore` and git won't track a `.git` folder, so those cases are also written at test time.
- No later change rewrites an archived folder. The corpus test fails if one does, and that is intended.

## Contract

The rust-core and rust-storage deltas below are the contract.

## Human steps

### Before approval

None

### After landing

- Update the Rust roadmap row "Approval seal hash in Rust" to Done.

## Delta

- `specs/rust-core/spec.md`: ADDED "Seal computation" and MODIFIED "Core does no IO", which now allows `sha2` (both task 1).
- `specs/rust-storage/spec.md`: ADDED "Change folder seal" and "Archived seals" (task 2).

Every file belongs to one task. Task 2 copies `seal-fixtures/` from this
change folder into the storage crate and does not edit core.
