---
title: The Rust specs kernel reads decisions/*.md into typed ADRs with the same fields TypeScript's readDecisions gives
depends_on: ["228"]
verify: sh scripts/verify-rust.sh
features:
  reads: []
---
## Goal

ADRs are the first nodes of ADR 024's link graph, so Rust has to read them
the way TypeScript does. After this change, the specs kernel reads every
`decisions/*.md` file into an `Adr` that has TypeScript's fields plus
`enforced_by`. It resolves `group:<name>` entries through the capability
sidecars and reports the errors and warnings `validateDecisions` reports,
each with its file and a fix.

Parity is proven two ways. A small fixture project in the crate covers every
field, a malformed list, a group, a superseded ADR, ignored files and every
validation finding; the expected values in the delta's tables were printed
by TypeScript's `readDecisions` and `validateDecisions` on that same fixture.
A golden test then compares the parse of frozen copies of all 26 ADRs with
JSON TypeScript printed once. The copies are frozen, so a later ADR or an
ADR edit does not break the test.

This replans rejected change 229, whose task 1 died twice because its scope
left out `Cargo.lock`, which adding `sha2` to the crate changes. The
contract is unchanged; only task 1's scope and guidance differ.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy` with
`-D warnings`, and every workspace test and doc test, corpus tests included.
When osq sets `OSQ_DIFF`, it then runs cargo-mutants on the change's diff.
`reading_decisions.rs` proves the records, fields, groups and the
TypeScript golden. `validating_decisions.rs` proves every finding.
`decisions_corpus.rs` proves that this repository's live ADRs read and
validate without errors. `public_api.rs` proves the new exports.

## Non-goals

- Any check that an ADR is enforced, or any link rule of ADR 024. That is
  `rust-link-gates`.
- Changing an ADR, the decisions README, or TypeScript's reader and
  validator.
- Rust config. `max_rule_length` is a parameter, which the caller takes from
  `limits.maxRuleLength` now and from `osq.toml` later.
- `systemWideAdrs`, `governingAdrs` and the doctor's check-file existence
  check. No Rust caller needs them yet.

## Surface

- Added: osq-kernel-specs items `Adr`, `AppliesTo`, `DecisionRecords`, `DecisionCode`, `DecisionFinding`, `DecisionProblems`, `read_decisions` and `validate_decisions` (Rust API).
- Added: ADR frontmatter field `enforced_by`, read by Rust only. No ADR sets it yet.

## Decisions

- ADR 022: the specs kernel stays a kernel crate on core. It gains only `sha2`, already a workspace dependency, for the ADR hash.
- ADR 023: parsing leaves are pure and work on text. `read_decisions` is the thin orchestrator that holds the folder and file reads. Every item has a doc comment.
- ADR 024: this change adds the ADR nodes, with `enforced_by` from section 1. Every new public function ends its doc with `Implements: rust-specs/<requirement>`, and every new test names `Covers: rust-specs/<scenario>`. Building the graph and the link gates come later.
- ADR 025: ADRs are read exactly as they are on disk today. The frontmatter is reused from `parse_frontmatter` and the sidecars from `parse_sidecar`.
- ADR 026: ADR parsing sits in the specs kernel next to the other OpenSpec documents, and no test runs `node`.

## Assumptions

- "A core type" in the brief means a typed struct exported by the specs kernel, the way `Proposal` and `TaskFile` are. It does not mean a type in `osq-core`. ADR 024 puts the graph types in core, and `rust-link-graph` can move or wrap `Adr` then.
- `enforced_by` takes a single string, such as `enforced_by: validator` in ADR 024, or a list. Either shape reads as a list.
- An ADR whose frontmatter is not valid YAML is ignored, as TypeScript ignores it. A file that is not UTF-8 is ignored too, where TypeScript would read it with replacement characters.
- The golden compares frozen copies under the crate's fixtures, not the live `decisions/` folder. The live folder gets the corpus test, which checks that every ADR reads and validates, so a new ADR never needs a golden update.
- Adding `sha2` to the specs crate changes only that crate's dependency list in the root `Cargo.lock`, so task 1 scopes `Cargo.lock`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-specs/spec.md`: ADDED "ADR records", "ADR fields", "ADR groups", "ADR validation" and "ADR parse parity"; MODIFIED "Public API", adding the `decisions` row and the two `DecisionCode` methods.

The change folder holds the inputs tasks copy byte for byte: `fixture/` is
the decisions fixture project, `repo-decisions/` the frozen ADR copies with
their sidecars, and `golden/decisions.json` the TypeScript golden for those
copies.

Shared files: task 1 owns `crates/kernel/specs/src/lib.rs`,
`crates/kernel/specs/src/decisions/mod.rs` and
`crates/kernel/specs/tests/public_api.rs`, and task 2 extends all three.
Task 2's new `crates/kernel/specs/src/decisions/validate.rs` falls inside
task 1's `crates/kernel/specs/src/decisions/*.rs` glob.
