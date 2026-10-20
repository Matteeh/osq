# Spec Delta: rust-core

## MODIFIED Requirements

### Requirement: Link graph
`osq-core` SHALL hold ADR 024's link graph as plain data, with no IO, in
its `graph` module. A `NodeId` is one of `Adr`, `Capability`, `Group`,
`Requirement`, `Scenario`, `File`, `Item`, `Test` and `Change`, in that
order, each holding one text key, and node ids order by that variant
order and then by the key's bytes. An id displays as its kind's prefix, a
colon and its key. A `Location` holds a `file` and an optional 1-based
`line`, and displays as `<file>:<line>`, or as `<file>` without a line. A
`Node` holds its `id`, its `name`, an optional `location`, an optional
`status`, which an ADR node sets to the ADR's status, `public`, which
an item node sets when the item is public, and `function`, which an item
or test node sets when the item is a function. An `EdgeKind` is one of
`applies_to`, `governs`, `owns`, `implements`, `covers`, `reads`,
`writes`, `supersedes` and `departs`, and `as_str` gives that name. An
`Edge` holds its `kind`, its `from` and `to` ids and an optional
`location`, the place in the files that states it.

A `Graph` starts empty. `add_node` adds a node and returns true, or, when
a node with that id is already there, keeps the first node and returns
false. `add_edge` keeps every edge in the order it was added, even when
an end names no node or the same edge was added before. `node` finds a
node by id, `nodes` lists the nodes in id order, `edges` lists every edge
in added order, and `edges_of`, `edges_from` and `edges_to` list, in
added order, the edges of one kind, from one id and to one id. `dangling`
lists, in added order, every edge whose `from` or `to` names no node, so a
rule can report a tag that names something missing.

#### Scenario: Node id display
- **WHEN** each node id below is displayed
- **THEN** it reads as given, and the ids sort in the order of the table:

| Id | Display |
|---|---|
| `Adr("024")` | `adr:024` |
| `Capability("rust-core")` | `capability:rust-core` |
| `Group("rust")` | `group:rust` |
| `Requirement("rust-core/link-graph")` | `requirement:rust-core/link-graph` |
| `Scenario("rust-core/node-id-display")` | `scenario:rust-core/node-id-display` |
| `File("crates/core/src/lib.rs")` | `file:crates/core/src/lib.rs` |
| `Item("crates/core/src/seal.rs::compute_seal")` | `item:crates/core/src/seal.rs::compute_seal` |
| `Test("crates/core/tests/fold.rs::folds")` | `test:crates/core/tests/fold.rs::folds` |
| `Change("231")` | `change:231` |

#### Scenario: Edge kind names
- **WHEN** `as_str` is read for each edge kind
- **THEN** the kinds give, in order, `applies_to`, `governs`, `owns`, `implements`, `covers`, `reads`, `writes`, `supersedes` and `departs`

#### Scenario: Location display
- **WHEN** each location below is displayed
- **THEN** it reads as given:

| File | Line | Display |
|---|---|---|
| `src/lib.rs` | 3 | `src/lib.rs:3` |
| `decisions/001-a.md` | none | `decisions/001-a.md` |

#### Scenario: Graph queries
- **WHEN** an empty graph gets the nodes `capability:a` named `a`, `item:src/lib.rs::f` named `f` and `requirement:a/one` named `One`, then a second node `capability:a` named `other`, then these edges in order: implements `item:src/lib.rs::f` to `requirement:a/one` at `src/lib.rs:3`, implements `item:src/lib.rs::f` to `requirement:a/two` at `src/lib.rs:4`, owns `capability:a` to `file:src/lib.rs`, and implements `item:src/lib.rs::f` to `requirement:a/one` at `src/lib.rs:3` again
- **THEN** the first three `add_node` calls return true and the fourth returns false, `node` of `capability:a` is named `a`, `node` of `file:src/lib.rs` is none, and the queries give:

| Query | Result |
|---|---|
| `nodes` | `capability:a`, `requirement:a/one`, `item:src/lib.rs::f` |
| `edges` | the four edges, in added order |
| `edges_of(implements)` | edges 1, 2 and 4 |
| `edges_of(owns)` | edge 3 |
| `edges_of(covers)` | none |
| `edges_from(item:src/lib.rs::f)` | edges 1, 2 and 4 |
| `edges_to(requirement:a/one)` | edges 1 and 4 |
| `edges_to(capability:a)` | none |
| `dangling` | edges 2 and 3 |

### Requirement: Rust rebuild decisions
osq's decisions SHALL include the five Rust rebuild ADRs 022 to 026, each
accepted, applying to the capability group `rust` through
`applies_to: [group:rust]`, so they govern every capability whose sidecar
names group `rust` and nothing under `src/`, naming `tests/rust-adrs.test.ts`
in its checks, and causing no decision problem. ADR 022 SHALL also name
`crates/core/tests/no_io.rs`, ADR 024 the linter kernel's link gate
tests, ADR 025 `crates/core/tests/event_corpus.rs`, and ADR 026 the specs
kernel's golden, validation, replay and parity tests and the linter
kernel's no-runtime-Node test. The index SHALL link each once, and
AGENTS.md's project rules block SHALL not change, since none applies to
all.

#### Scenario: Rust ADRs are accepted
- **WHEN** osq's own decisions are read with `readDecisions` and `DEFAULT_CONFIG`
- **THEN** each ADR below is listed and not ignored, with status `accepted`, `appliesTo` `["group:rust"]`, `governs` holding `rust-core`, and the checks of its row, `validateDecisions` reports no error and no warning, and `decisions/README.md` links its file exactly once:

| ADR | File | Checks |
|---|---|---|
| 022 | `022-rust-feature-crates.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/no_io.rs` |
| 023 | `023-rust-code-style.md` | `tests/rust-adrs.test.ts` |
| 024 | `024-rust-link-enforcement.md` | `tests/rust-adrs.test.ts`, `crates/kernel/linter/tests/link_gates.rs`, `crates/kernel/linter/tests/link_gates_corpus.rs` |
| 025 | `025-rust-on-disk-format.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/event_corpus.rs` |
| 026 | `026-openspec-in-rust.md` | `tests/rust-adrs.test.ts`, `crates/kernel/specs/tests/golden_corpus.rs`, `crates/kernel/specs/tests/validate_corpus.rs`, `crates/kernel/specs/tests/replay_corpus.rs`, `crates/kernel/specs/tests/openspec_validate_parity_corpus.rs`, `crates/kernel/specs/tests/openspec_archive_parity_corpus.rs`, `crates/kernel/linter/tests/node_spawn_corpus.rs` |

#### Scenario: Rules block without the Rust ADRs
- **WHEN** `renderRulesBlock` renders osq's own decisions
- **THEN** no line ends in `ADR 022`, `ADR 023`, `ADR 024`, `ADR 025` or `ADR 026`, and `checkProjectRules` reports nothing

#### Scenario: Rust ADR check files exist
- **WHEN** every check file named by ADRs 022 to 026 is looked up from the repository root
- **THEN** each one exists
