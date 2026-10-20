---
title: The ADR 024 link rules that hold for the repository as a whole block in verify-rust.sh
depends_on: ["231"]
verify: sh scripts/verify-rust.sh
check: node --import tsx --import ./tests/git-test-env.ts --test tests/rust-adrs.test.ts
creates:
  - name: rust-workspace
    group: rust
features:
  reads: [rust-specs, cli-foundation, spec-lint-and-approve]
---
## Goal

ADR 024 section 3 lists four link rules that hold for the repository as a
whole: every governed file is owned by exactly one capability, every
capability has a spec with a Purpose and a requirement and owns a file,
no reference is broken, and every public function has an `Implements:`
tag. This change writes them as core `Rule`s in the linter kernel, over
the graph from `rust-link-graph`, with `link_gates` running all four, and
proves each on a fixture project that breaks it. Each finding names its
file and line and gives one fix.

A corpus test runs the gates over this repository in
`sh scripts/verify-rust.sh`. Today the repository breaks two rules: ten
tags name nothing, and fourteen placeholder crates belong to no
capability. The change fixes the tags. It creates the `rust-workspace`
capability to own the placeholder crates, but that ownership only becomes
living at archive, while the watcher runs `verify-rust.sh` after every
task. So the corpus test gates the other three rules now, and a follow-up
queue item adds `owned-once` once this change has landed.

The same timing hits `live-references`: this change's own code tags the
requirements and scenarios its delta adds, which are not living until
archive. ADR 024 runs link gates with the change as an input, so
`change_link_gates` also counts what a change's deltas add, modify or
rename to as live, and the corpus test passes the folder osq names in
`OSQ_CHANGE`. Every later Rust change needs this too.

To tell a public function from a public struct, `CodeItem` and the graph's
`Node` gain a `function` flag.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy` with
`-D warnings`, and every workspace test, corpus tests included, then
cargo-mutants on the change's diff when osq sets `OSQ_DIFF`.
`crates/kernel/linter/tests/link_gates.rs` proves every rule on the
`link-gates` fixture, `link_gates_change.rs` proves `change_link_gates`
on the `link-gates-change` fixture, and `link_gates_corpus.rs` proves this repository
breaks none of the three rules it gates. The `check` runs
`tests/rust-adrs.test.ts`, which proves ADR 024's `checks` name both.

## Non-goals

- The rules about a single change, the llvm-cov coverage check, the
  mutation and ADR checks before land, the departure gate and the archive
  writer.
- The rules over the TypeScript code under `src/`.
- Gating `owned-once` on this repository. The follow-up item does that
  once `rust-workspace` is living.
- A `#[covers]` attribute, a CLI command for the gates, or measuring
  rules.

## Surface

- Added: osq-core `Node` field `function` (Rust API).
- Added: osq-kernel-linter `CodeItem` field `function` (Rust API).
- Added: osq-kernel-linter module `gates` with `OwnedOnce`, `CompleteCapabilities`, `ScopedCapability`, `LiveReferences`, `TaggedFunctions`, `link_gates` and `change_link_gates` (Rust API).
- Read: the `OSQ_CHANGE` environment variable, by the link gates corpus test.
- Added: link rule names `owned-once`, `complete-capabilities`, `live-references` and `tagged-functions`, shown in each finding.

## Decisions

- ADR 022: the rules live in the linter kernel on core's `Rule` trait and `Graph`; the linter gains no dependency, and core gains only a field and still does no IO.
- ADR 023: each rule's `check` is a pure function of the graph and the data it holds; `link_gates` is the thin orchestrator that reads the files. Every item has a doc comment.
- ADR 024: these are section 3's four rules for the repository as a whole, all blocking; `owned-once` joins the repository gate in the follow-up, as the Goal says. The gates take the change as an input, as section 3's Enforcement says, through `change_link_gates`. Every new public function ends its doc with `Implements: rust-linter/link-gates`, and every new test names `Covers: <capability>/<scenario>` in kebab-case. ADR 024's `checks` names the new tests.
- ADR 025: the gates read `decisions/`, `openspec/specs/` and the crates as they are on disk.
- ADR 026: ADRs, specs, sidecars and ownership come only from the specs kernel; no test runs `node`.

## Assumptions

- "Every public function" means a public `Item` node that is a function, in a file under a `src` folder. Public structs, enums, constants and modules, and `pub` helpers in `tests/`, are not checked. Today 204 public items lack a tag, and none of them is a public function under `src/`.
- `rust-workspace` owns the 14 placeholder crates (5 kernel, 8 feature, the cli app), one glob per crate, so a later change moves one crate out by dropping its glob. It does not own the root `Cargo.toml` or `Cargo.lock`.
- `complete-capabilities` checks only capabilities whose sidecar names the given group. The repository gate uses `rust`, since the TypeScript capabilities own no Rust file.
- `live-references` does not check `governs` edges to capabilities, because `applies_to` already states them. Reporting both would report each mistake twice.
- The ten broken tags are fixed by renaming them to the tag id of the scenario they mean. `Events reach their stream's state` has the tag id `events-reach-their-stream-s-state`. The file tag `Implements: rust-core/reason-and-outcome-values` in `event_values.rs` names a scenario, not a requirement, and every test in that file already covers that scenario, so the file tag is removed.
- Task 4 edits three rust-specs test files without a rust-specs delta. It changes only their `Covers:` lines to the ids rust-specs already has, so lint's warning about that is expected.
- Adding `function` to `Node` and `CodeItem` changes three preexisting test files from 231, so task 1 sets `tests.modify`.
- osq sets `OSQ_CHANGE` to the active change folder for every task and change verify, archive included. At archive the change verify runs after the deltas are applied, so the nodes `change_link_gates` adds are already there and are kept. A tag to a requirement the change REMOVES stays live until archive, where the change verify then catches it.
- With the change's deltas counted, the repository's only `live-references` findings are the ten tags task 4 renames; this was checked on a copy of the task 2 tree.

## Human steps

### Before approval

None

### After landing

- Queue `rust-link-gates-ownership`: now that `rust-workspace` is living, make `link_gates_corpus.rs` fail on every `link_gates` finding, `owned-once` included, and change rust-linter "Live link gates" to match.

## Delta

- `specs/rust-core/spec.md`: MODIFIED "Link graph" (the `function` field) and "Rust rebuild decisions" (ADR 024's checks).
- `specs/rust-linter/spec.md`: MODIFIED "Code tags" and "Link graph build" (the `function` flag); ADDED "Link gates" and "Live link gates".
- `specs/rust-workspace/spec.md`: new capability, ADDED "Code ownership".

The change folder holds `fixtures/link-gates/`, the fixture project task 2
copies byte for byte, and `fixtures/link-gates-change/`, which task 3
copies the same way. The "Findings of the link gates fixture" and
"Findings of the link gates change fixture" tables, line numbers
included, were written against them.

Task 3 extends `crates/kernel/linter/src/gates.rs` and
`crates/kernel/linter/src/lib.rs`, which task 2 owns.
