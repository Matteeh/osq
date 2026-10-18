---
title: The Rust specs kernel validates specs and changes with ADR 026's strict rules, each finding with a stable code, file, line and fix
depends_on: ["216"]
verify: sh scripts/verify-rust.sh
features:
  reads:
    - rust-core
---
## Goal

TypeScript osq checks a change and the living specs by running the Node
`openspec validate --strict --json` and mapping its issues in
`src/core/spec/openspec-issues.ts`. ADR 026 moves that check into the Rust
specs kernel, so Rust osq never runs Node for it, and section 2 lists the
rules. This change adds them to `osq-kernel-specs`, on top of the parse
215 built:

- `validate_living_spec` and `validate_living_specs` check living specs;
- `validate_delta` checks a delta spec on its own, and
  `check_delta_targets` checks that its MODIFIED, REMOVED and RENAMED
  entries name requirements the living spec has;
- `validate_change` reads a change folder and runs both on each delta,
  and finds a change with no delta.

Each finding is a `SpecFinding` with a stable kebab-case code, the file,
the line, the requirement where one applies, a message and one fix, in the
shape of TypeScript's `LintFinding` plus code, line and fix. Every finding
blocks, as ADR 026 section 2 says, so there is no severity. A fixture set
holds one invalid document per code, and corpus tests check that every
living spec and every archived delta validates.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy` with `-D warnings`
and every workspace test, the corpus tests included, then cargo-mutants on
the change's own diff when osq sets `OSQ_DIFF`. That covers:

- the finding codes and fixes, and every rule on its fixture under
  `crates/kernel/specs/tests/fixtures/validate/`;
- the folder readers and their read errors;
- the corpus tests over this repository's living specs and archived
  deltas.

No test runs `node`, `openspec` or `osq`, and none needs the network.

## Non-goals

- Validating the merged result of a change's deltas, and with it the rule
  that no two requirements of one capability share a scenario name. Both
  need the merge, in `rust-specs-merge`. Twenty scenario names repeat
  across requirements of today's living specs, so this change checks
  scenario names within one requirement only.
- osq's own lint rules outside OpenSpec, such as scope, verify, Decisions,
  repeated scenario or banned word checks.
- Wiring the validator into a Rust lint or approve command.
- Any change to the parse, to TypeScript, or to OpenSpec's warnings that
  osq does not block on today, such as an orphan requirement or a target
  the archive cannot apply.

## Surface

- Added: the `osq-kernel-specs` public items `SpecFinding`, `FindingCode`, `validate_living_spec`, `validate_living_specs`, `validate_delta`, `check_delta_targets` and `validate_change`.
- Added: the finding codes `missing-purpose`, `missing-requirements`, `requirement-outside-section`, `delta-section-in-living-spec`, `duplicate-requirement`, `requirement-without-shall`, `requirement-without-scenario`, `scenario-without-when`, `scenario-without-then`, `duplicate-scenario`, `unknown-delta-section`, `empty-delta-section`, `missing-delta-sections`, `unpaired-rename`, `invalid-rename`, `conflicting-delta`, `unknown-requirement` and `change-without-delta`.

## Decisions

- ADR 022: validation is part of the specs kernel crate, which depends only on core. No feature crate is touched.
- ADR 023: every rule is a pure leaf over the parsed document and its lines. Only `validate_living_specs` and `validate_change` touch the disk.
- ADR 024: every public function's doc ends with `Implements: rust-specs/<requirement>`, and every test's doc names `Covers: rust-specs/<scenario>`. The corpus tests have fast counterparts on the validate fixtures.
- ADR 025: validation reads today's living specs and change folders as they are, and writes nothing.
- ADR 026: the specs kernel runs the section 2 rules itself and never spawns `openspec` or `node`. Every finding blocks, and each has a stable code, the file and line, and one fix.

## Assumptions

- The rules follow ADR 026 section 2, not OpenSpec 1.13.1 exactly. OpenSpec only warns about a requirement without SHALL or MUST and a living requirement without a scenario, and osq lets warnings pass today. Here they block. A scratch scan on 2026-10-18 found none of either in the 13 living specs or the 495 archived delta specs, so nothing that passes today fails here.
- SHALL and MUST count only outside code fences, as OpenSpec counts them, and only in ADDED and MODIFIED requirements. REMOVED requirement blocks hold a reason and need no keyword.
- The same scan found no other finding in the living specs or in the delta specs of archived changes 001 to 216. Seventeen archived changes, 001 to 015, 018 and 019, have no delta spec, because they came before osq used deltas; the corpus test names them.
- The cross-reference check needs the living spec as it was when the change ran, which the archive does not keep. So the corpus tests check archived deltas only with `validate_delta`, and `check_delta_targets` is proved on the fixture set.
- A finding's `file` is the path the caller passes, or the path the folder readers join to the folder they are given. Callers that pass repository-relative folders get repository-relative files.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-specs/spec.md`: ADDED "Validation findings", "Requirement validation", "Living spec validation", "Delta spec validation", "Delta targets", "Validation corpus".

Shared files: `crates/kernel/specs/src/lib.rs`, `crates/kernel/specs/src/validate/mod.rs` and `crates/kernel/specs/src/validate/outline.rs`, which task 1 writes and task 2 extends. Task 3 may correct the rule files `src/validate/living*.rs` and `requirement*.rs`, which task 1 owns, and `src/validate/delta*.rs`, which task 2 owns, where the corpus disagrees; no file is shared by three tasks. The watcher recertifies tasks 1 and 2 when a later task touches them.
