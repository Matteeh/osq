---
title: Every repository link gate sees the change in flight, and the corpus gate blocks on owned-once too
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-specs]
---
## Goal

`link_gates_corpus.rs` runs the four ADR 024 link rules on this repository
in every verify, but blocks on only three. `owned-once` stays out because
ownership comes only from the living specs: a capability a change creates
owns nothing until archive, so its new files would fail the gate during
the change's own run. 232 fixed the same timing for `live-references` by
letting `change_link_gates` count the requirements and scenarios a
change's deltas add as live.

This change does the same for ownership. With a change, the link gates
use the `Code ownership` globs that change's deltas add or modify in place
of the living ones, so a new capability owns its files during its own run
and a capability that hands files to another stops owning them. Then
`link_gates_corpus.rs` fails on every finding, `owned-once` included, and
rust-linter "Live link gates" states the rule for later gates: a
repository gate takes the change in flight as an input. The repository has
no `owned-once` finding today.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy` with
`-D warnings`, and every workspace test, corpus tests included, then
cargo-mutants on the change's diff when osq sets `OSQ_DIFF`.
`crates/kernel/linter/tests/link_gates_ownership.rs` proves the change's
ownership on the new `link-gates-ownership` fixture, and
`link_gates_corpus.rs` proves this repository, with this change in
`OSQ_CHANGE`, breaks none of the four rules.

## Non-goals

- The per-change rules of ADR 024: governing ADRs named, coverage and
  departures.
- Gates over the TypeScript code.
- A delta that REMOVES or RENAMES `Code ownership`; only ADDED and
  MODIFIED ownership changes the globs.
- Capability nodes or `complete-capabilities` findings for a capability a
  change creates.

## Surface

- Changed: osq-kernel-linter `change_link_gates` uses the change's `Code ownership` globs (Rust API behaviour).
- Changed: the link gates corpus test now fails on `owned-once` findings.

## Decisions

- ADR 022: the code stays in the linter kernel, which already depends on the specs kernel for `read_delta`, `code_ownership` and `read_capability_ownership`; no crate gains a dependency.
- ADR 023: the ownership merge is a small pure function over the living globs and the read deltas; `change_link_gates` stays the orchestrator that reads files. Every new item has a doc comment.
- ADR 024: Enforcement runs link gates "with the change, the base commit and the graph as explicit inputs"; the change now feeds ownership as well as live nodes, and `owned-once` joins the blocking repository gate. New tests name `Covers: rust-linter/<scenario>`, and changed public functions keep `Implements: rust-linter/link-gates`.
- ADR 025: the deltas are read from the change folder as they are on disk.
- ADR 026: deltas and ownership globs come only from the specs kernel; no test runs `node`.
- ADR 027: it governs scheduling in core, which this change does not touch; with changes running in parallel, each verify passes its own folder in `OSQ_CHANGE`, so a gate sees only its own change's ownership.

## Assumptions

- A capability's MODIFIED `Code ownership` replaces its living globs whole, as archive's merge replaces the requirement, so a capability that hands files to a new one stops owning them during the run.
- At archive the change verify runs after the deltas are applied, so the change's globs and the living globs are the same and the result does not change.
- Ignoring REMOVED `Code ownership` is safe today: a capability that is removed keeps owning its files until archive, which can only add an "owned by A, B" finding when a change also hands the same files to another capability. No change has done that yet.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-linter/spec.md`: ADDED "Change ownership"; MODIFIED "Live link gates" (blocks on every rule, and states that repository gates take the change in flight).

The change folder holds `fixtures/link-gates-ownership/`, the fixture
project task 1 copies byte for byte. The "Change ownership" scenarios were
checked against it on a prototype of task 1.
