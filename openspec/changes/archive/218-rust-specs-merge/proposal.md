---
title: The Rust specs kernel applies a change's deltas to the living specs with TypeScript's merge semantics, and the merged result validates
depends_on: ["217"]
verify: sh scripts/verify-rust.sh
features:
  reads:
    - rust-core
---
## Goal

Rust osq has to archive a change's deltas into the living specs without
the Node CLI, and get the same result TypeScript gets. ADR 026 section 3
ports the merge in `src/core/spec/delta.ts` and `apply-deltas.ts` as it
is. Section 2 makes the merged result validate as a living spec, which
replaces `merged-spec-check.ts`. This change adds both to
`osq-kernel-specs`, on top of the parse from 215 and the validation from
217:

- `merge_delta` and `merge_living_spec` merge one parsed delta into a
  base text, byte for byte as `mergeDelta` and `mergeLivingSpec` do, and
  `MergeError` carries every refusal `DeltaMergeError` makes, with the
  same message;
- `merge_change` merges every delta spec of a change folder against a
  specs folder and writes nothing;
- `validate_merged_change` validates each merged text with the 217 rules
  and leaves out findings the living spec already has.

Fixtures printed by TypeScript hold one case per merge path and refusal,
plus frozen copies of the `tests/fixtures/openspec-diff/` cases with
TypeScript's result for each. A corpus test replays the whole archive in
landing order and gets `openspec/specs/` back.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy` with `-D warnings`
and every workspace test, the corpus tests included, then cargo-mutants on
the change's own diff when osq sets `OSQ_DIFF`. That covers:

- every merge case and refusal under
  `crates/kernel/specs/tests/fixtures/merge/cases/`;
- the change merge, the merged validation and the differential cases;
- the archive replay against this repository's living specs.

No test runs `node`, `openspec` or `osq`, and none needs the network.

## Non-goals

- Writing specs to disk, removing an emptied capability's folder,
  archiving folders or touching git. The archive feature does those
  later, from `merge_change`'s result.
- Any change to the TypeScript merge, to `merged-spec-check.ts` or to the
  differential test.
- Porting `serializeCapabilitySpec`. Archive writes `mergeDelta`'s text,
  which keeps the base's own text outside the requirements, and nothing
  in `src/` calls the serializer.
- The capability-wide repeated scenario check in
  `duplicate-scenario-lint.ts`, and osq's other lint rules outside
  OpenSpec. They belong with the Rust lint port.
- Wiring the merge or the merged validation into a Rust lint, approve or
  archive command.

## Surface

- Added: the `osq-kernel-specs` public items `merge_delta`, `merge_living_spec`, `MergeError`, `merge_change`, `MergedSpec`, `MergeChangeError` and `validate_merged_change`.

## Decisions

- ADR 022: the merge lives in the specs kernel crate, which depends only on core. No feature crate is touched, and no crate is added.
- ADR 023: `merge_delta` and `merge_living_spec` are pure, with named leaves for the split, each operation and the write back. Only `merge_change` and `validate_merged_change` touch the disk, and only to read.
- ADR 024: every public function's doc ends with `Implements: rust-specs/<requirement>`, every test's doc names `Covers: rust-specs/<scenario>`, and the replay corpus test has the differential cases as its fast counterpart.
- ADR 025: the merge reads today's living specs, delta specs and event files as they are, and writes nothing.
- ADR 026: the merge keeps `delta.ts` semantics, and merged results validate with the section 2 rules. Nothing spawns `node`, `npx` or `openspec`.

## Assumptions

- The brief asks for serialization "as `serializeCapabilitySpec` does". Archive writes `mergeDelta`'s text instead, which keeps the base's text outside the requirements, such as a `## Notes` section or a BOM, and only `tests/delta-merge.test.ts` calls `serializeCapabilitySpec`. So the Rust merge matches `mergeDelta`, and `serializeCapabilitySpec` is not ported.
- A scratch replay with the TypeScript merge on 2026-10-18 matched every living spec when changes were taken in landing order. In folder-name order, `cli-foundation` differed. Six living specs, named in "Archive replay", match only once the blank line after `## Purpose` is removed, which `tests/living-specs-delta-equivalence.test.ts` also allows. No archived delta failed to merge, so no change needs to be named as an exception.
- The replay takes landing order from the last `archived` event in each folder's `.run/events/change.jsonl`, as TypeScript's `readLandedAt` does. It also takes active changes holding `.run/archive-specs.json`, so the corpus test still passes when archive runs this change's own verify after applying its deltas.
- Merged findings carry the delta's path and the line of the delta's header for that requirement, or line 1. TypeScript's merged findings have no line, and a merged text has no file on disk to point at.
- Unlike TypeScript, which treats an unreadable delta as absent, `merge_change` makes a delta or living spec that cannot be read or is not UTF-8 a read error, as `validate_change` does. The scratch replay read every archived delta, so nothing in the archive is affected.
- The fixtures under `fixture/merge/cases/` and the `expected/` trees and `error.txt` files under `fixture/merge/openspec-diff/` were printed by a scratch TypeScript script that ran `mergeDelta` and `applyOpenSpecDeltas` on 2026-10-18. The inputs under `openspec-diff/` are copies of `tests/fixtures/openspec-diff/` as of that day. No case has a CRLF, because `.gitattributes` makes `*.md` LF.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-specs/spec.md`: ADDED "Delta merge", "Merge refusals", "Change merge", "Merged spec validation", "Archive parity cases", "Archive replay".

Shared files: `crates/kernel/specs/src/lib.rs` and `crates/kernel/specs/src/merge/mod.rs`, which task 1 writes and task 2 extends. Task 3 may correct task 1's merge files, `src/merge/error.rs`, `base*.rs`, `apply*.rs` and `compose*.rs`, where the archive disagrees. No file is shared by three tasks. The watcher recertifies task 1 when a later task touches its files.
