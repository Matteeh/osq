---
title: Core holds ADR 024's link graph, and the linter kernel builds it from ADRs, specs, sidecars and the tags in Rust code
depends_on: ["230"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-specs]
---
## Goal

ADR 024 says every link rule is a query over one graph of ADRs,
capabilities, requirements, scenarios, files, code items and tests, built
from the files so it can be rebuilt at any time. This change builds that
graph. `osq-core` gains the graph types, the `Rule` trait and its
`Finding`, with no IO. The linter kernel gains `code_tags`, which reads
the `Implements:`, `Covers:` and `Adr:` doc tags of Rust source with
`syn`, and `build_link_graph`, which joins the ADRs from `read_decisions`,
the capabilities, requirements, scenarios and ownership from the specs
kernel, and the items and tests of every workspace crate. A tag that names
something missing stays in the graph as a dangling edge, so the rules of
`rust-link-gates` can report it.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy` with
`-D warnings`, and every workspace test, corpus tests included, then
cargo-mutants on the change's diff when osq sets `OSQ_DIFF`.
`crates/core/tests/graph.rs` proves the graph types, tag ids and rules.
`crates/kernel/linter/tests/code_tags.rs` proves the tag reader on its
fixture source. `crates/kernel/linter/tests/link_graph.rs` proves every
node and edge of the fixture project, and `link_graph_corpus.rs` proves
that every tag line of this repository becomes an edge.

## Non-goals

- Any rule or gate over the graph. That is `rust-link-gates`.
- `Change` nodes and `reads`, `writes` and `departs` edges, which need
  change folders and features. The types hold them; the builder adds none.
- A `#[covers]` attribute, the storage `links` view and the server graph
  endpoint.
- Fixing tags that name missing nodes today. They become dangling edges
  for `rust-link-gates` to report.
- Tags in languages other than Rust.

## Surface

- Added: osq-core module `graph` with `NodeId`, `Node`, `Location`, `EdgeKind`, `Edge`, `Graph`, `Rule`, `Finding`, `run_rules` and `tag_id` (Rust API).
- Added: osq-kernel-linter items `CodeTags`, `CodeItem`, `Tag`, `TagKind`, `code_tags`, `GraphError` and `build_link_graph` (Rust API).
- Added: the `Adr: <number>` doc tag on Rust items, read by the graph. No item carries one yet.

## Decisions

- ADR 022: the graph types live in core and do no IO. The linter kernel builds the graph and gains only `osq-kernel-specs`, a kernel crate, as a dependency.
- ADR 023: tag reading and node naming are pure functions on source text; `build_link_graph` is the thin orchestrator that reads folders and files. Every item has a doc comment.
- ADR 024: this is section 2's graph. Node and edge kinds follow its list, with `Group` added and functions widened to `Item`, as the assumptions say. Every new public function ends its doc with `Implements: rust-core/<requirement>` or `Implements: rust-linter/<requirement>`, and every new test names `Covers: <capability>/<scenario>` in kebab-case.
- ADR 025: the graph reads `decisions/`, `openspec/specs/` and the crates as they are on disk, through the specs kernel's existing readers.
- ADR 026: ADRs, specs, sidecars and ownership come only from the specs kernel; no test runs `node`.

## Assumptions

- ADR 024's "functions" node is `Item`, which holds every named item, because 17 `Implements:` tags sit on structs and enums today. Tests are their own `Test` node, and a `//!` tag is an edge from the file's `File` node.
- A `Group` node exists so `applies_to: [group:<name>]` points at a node, and a group no capability has gives a dangling edge.
- An `Adr: <number>` tag is a `governs` edge from that ADR to the tagged item, since ADR 024 lists no other edge between an ADR and code.
- `File` nodes are the `.rs` files under each workspace member's `src/` and `tests/`, outside `tests/fixtures/`. Other files a capability owns, such as `tests/rust-adrs.test.ts`, get no node until a reader for their language exists, as ADR 024's consequences say.
- Tag targets are kept as written, not converted to kebab-case. Today one `Implements:` and nine `Covers:` lines name no node: eight `Covers:` lines from 230 name scenario titles, and `rust-core/reason-and-outcome-values` and `rust-core/events-reach-their-streams-state` name no living requirement or scenario. They stay dangling until `rust-link-gates` reports them.
- The parity corpus test's tests are written by a `macro_rules!` macro, which the reader does not expand, so its `Covers:` attribute is not read. Tests inside `proptest!` are read from the macro's tokens.
- `decisions` and `openspec` are parameters of `build_link_graph`, since Rust has no config yet.
- Adding `osq-kernel-specs` to the linter changes only that crate's dependency list in the root `Cargo.lock`, so task 3 scopes `Cargo.lock`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-core/spec.md`: ADDED "Link graph", "Tag ids" and "Link rules".
- `specs/rust-linter/spec.md`: ADDED "Code tags", "Link graph build" and "Live link graph".

The change folder holds the inputs tasks copy byte for byte:
`fixtures/code-tags/lib.rs` is the tag reader's fixture source and
`fixtures/link-graph/` the fixture project, a Cargo workspace with ADRs and
living specs. The delta's tables were written against them, line numbers
included.

Shared files: task 2 owns `crates/kernel/linter/src/lib.rs`, and task 3
extends it.
