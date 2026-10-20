---
queue_item: rust-link-graph
queue_hash: sha256:c1be4b43c5416196419819c7cf25905c805afab91854d93efd97e79c9a14ae39
planner: null
date: 2026-10-20
---

### Goal

One graph of ADRs, capabilities, requirements, scenarios, files, functions and tests, built from the files, so every later link rule is a query over it.

### Context

As of 2026-10-19:

- ADR 024 section 2: nodes are ADRs, capabilities, requirements, scenarios, files, functions, tests and changes; edges are `applies_to`, `governs`, `owns`, `implements`, `covers`, `reads`, `writes`, `supersedes` and `departs`. Core holds the graph types and the rule trait. The specs kernel parses ADRs, specs and sidecars, the linter kernel reads code tags with `syn`, and the graph can be rebuilt from files at any time.
- The crates already carry tags as doc lines: about 147 `Implements: <capability>/<requirement>` and 200 `Covers: <capability>/<scenario>` (AGENTS.md, Rust crates). No `#[covers]` attribute exists yet. Some items also name ADRs.
- `crates/kernel/linter` (rust-linter) already walks the workspace with `syn` for the no-runtime-Node gate (219). Kernel crates may depend on other kernel crates (ADR 022).
- Code ownership comes from each living spec's `Code ownership` requirement through the specs kernel's owners module.

### Requirements

- Core defines the node and edge types, the graph, and a rule trait whose findings name the node, the file and line where there is one, and a fix. Core does no IO.
- The linter kernel builds the graph for this repository: ADRs from `rust-adr-parse`, capabilities, requirements, scenarios and ownership from the specs kernel, and functions and tests with their `Implements:`, `Covers:` and ADR tags from the Rust crates.
- A tag that names a missing node is kept as a dangling edge, so a rule can report it.
- Tests build the graph from fixture folders and check each edge kind. A corpus test builds it for this repository and checks the counts of tags it finds.

### Non-goals

- Any rule or gate; that is `rust-link-gates`.
- `changes`, `reads`, `writes` and `departs` edges, which need change folders and features; the types may hold them.
- A `#[covers]` attribute, the storage `links` view and the server graph endpoint.
