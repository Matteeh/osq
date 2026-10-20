## ADDED Requirements

### Requirement: Link graph
`osq-core` SHALL hold ADR 024's link graph as plain data, with no IO, in
its `graph` module. A `NodeId` is one of `Adr`, `Capability`, `Group`,
`Requirement`, `Scenario`, `File`, `Item`, `Test` and `Change`, in that
order, each holding one text key, and node ids order by that variant
order and then by the key's bytes. An id displays as its kind's prefix, a
colon and its key. A `Location` holds a `file` and an optional 1-based
`line`, and displays as `<file>:<line>`, or as `<file>` without a line. A
`Node` holds its `id`, its `name`, an optional `location`, an optional
`status`, which an ADR node sets to the ADR's status, and `public`, which
an item node sets when the item is public. An `EdgeKind` is one of
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

### Requirement: Tag ids
`tag_id(name)` SHALL turn a requirement or scenario name into the kebab-case
id that `Implements:` and `Covers:` tags name: ASCII letters are lowercased,
ASCII digits are kept, every run of any other characters becomes one `-`,
and a leading or trailing `-` is dropped.

#### Scenario: Tag id cases
- **WHEN** `tag_id` reads each name below
- **THEN** it returns the given id:

| Name | Id |
|---|---|
| `Code ownership` | `code-ownership` |
| `ADR records` | `adr-records` |
| `Core does no IO` | `core-does-no-io` |
| `Event lines round-trip` | `event-lines-round-trip` |
| `Rust CI parity job` | `rust-ci-parity-job` |
| `  Spaced -- out!  ` | `spaced-out` |
| `Café menu 2` | `caf-menu-2` |
| `already-kebab` | `already-kebab` |
| empty | empty |

### Requirement: Link rules
A link rule SHALL implement core's `Rule` trait: `name` gives the rule's
name, and `check` reads a `Graph` and returns its findings. A `Finding`
holds the `rule` name, the `node` it is about, an optional `location`,
a `message` and a `fix`, and displays as `<location>: <message>`, or as
`<node>: <message>` without a location. `run_rules(graph, rules)` SHALL
return every rule's findings, rule by rule in the order given, each
rule's findings in the order it returned them.

#### Scenario: Rules run in order
- **WHEN** `run_rules` runs, over the graph of "Graph queries", a rule named `dangling` that returns one finding per dangling edge, about its `from` node, at its location, with the message `<kind> edge to <to> names no node` and the fix `Name a node that exists.`, and then a rule named `quiet` that returns none
- **THEN** it returns these findings, in order:

| Rule | Node | Display |
|---|---|---|
| `dangling` | `item:src/lib.rs::f` | `src/lib.rs:4: implements edge to requirement:a/two names no node` |
| `dangling` | `capability:a` | `capability:a: owns edge to file:src/lib.rs names no node` |

#### Scenario: Finding display
- **WHEN** a finding with the message `m` is displayed with each location below
- **THEN** it reads as given:

| Node | Location | Display |
|---|---|---|
| `adr:001` | `decisions/001-a.md`, no line | `decisions/001-a.md: m` |
| `adr:001` | `src/lib.rs`, line 7 | `src/lib.rs:7: m` |
| `adr:001` | none | `adr:001: m` |
