# rust-linter Specification

## Purpose
The linter kernel holds osq's lint gates over Rust crates. Its first gate keeps Node out of the Rust runtime, as ADR 026 requires.

## Requirements

### Requirement: Code ownership
<!-- source: crates/kernel/linter/** -->
The rust-linter capability SHALL own the `osq-kernel-linter` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Linter crate ownership
- **WHEN** file ownership is resolved for the no-runtime-Node gate of the linter kernel
- **THEN** system maps `crates/kernel/linter/**` to rust-linter

### Requirement: Node spawns
`node_spawns(file, source)` SHALL return every place the Rust source text
`source` spawns Node, as a `NodeSpawn { file, line, program }` with `file`
as given, in source order. It parses `source` with `syn`, and a spawn is
a call whose function is a path ending in the segments `Command` and
`new`, such as `Command::new` or `std::process::Command::new`, whose first
argument is a string literal. That literal's value is the `program`. It
names Node when its last part, after the last `/` or `\`, with a trailing
`.exe` or `.cmd` removed, is exactly `node`, `npx` or `openspec`. `line`
is the 1-based line where the call's path starts. A call with any other
program, a program that is not a string literal, and a string outside
such a call are not spawns. A source that does not parse is
`ScanError::Parse` naming the file and the line `syn` reports.

#### Scenario: Spawned programs
- **WHEN** the source `fn main() {\n    let _ = std::process::Command::new(<program>).status();\n}\n` is scanned with each program below
- **THEN** the result is as given:

| Program | Result |
|---|---|
| `"node"` | a spawn of `node` at line 2 |
| `"npx"` | a spawn of `npx` at line 2 |
| `"openspec"` | a spawn of `openspec` at line 2 |
| `"/usr/bin/node"` | a spawn of `/usr/bin/node` at line 2 |
| `"node.exe"` | a spawn of `node.exe` at line 2 |
| `"C:\\tools\\npx.cmd"` | a spawn of `C:\tools\npx.cmd` at line 2 |
| `"nodemon"` | none |
| `"openspec-lsp"` | none |
| `"Node"` | none |
| `"git"` | none |
| `program` | none |

#### Scenario: Unparsable source
- **WHEN** the source `fn main( {\n` is scanned
- **THEN** the result is a parse error naming the file

### Requirement: Workspace Node spawns
`workspace_node_spawns(root)` SHALL scan the runtime code of every member
of the Cargo workspace at `root`: each `.rs` file under the member's
`src/` folder, at any depth, in byte order of their paths, members in the
order the root `Cargo.toml` lists them. It returns the `NodeSpawn` of
each, with `file` the path relative to `root` written with `/`. Tests,
examples, benches and build scripts are not runtime code, so the parity
tests may run the OpenSpec CLI. The members are the double-quoted strings
of the `members` array of the `[workspace]` table, which may span lines
and carry `#` comments. A manifest without that array, or with a member
holding `*`, is `ScanError::Manifest` naming the manifest. A file that
cannot be read or is not UTF-8 is `ScanError::Read` naming it.

#### Scenario: Fixture workspace
- **WHEN** `workspace_node_spawns` scans `crates/kernel/linter/tests/fixtures/node-spawn/`
- **THEN** it returns exactly these spawns, in this order:

| File | Line | Program |
|---|---|---|
| `crates/spawner/src/lib.rs` | 9 | `node` |
| `crates/spawner/src/lib.rs` | 14 | `/usr/local/bin/npx` |
| `crates/spawner/src/run/mod.rs` | 5 | `openspec.cmd` |

#### Scenario: Workspace scan errors
- **WHEN** each workspace below, written under a temporary folder, is scanned
- **THEN** the result is as given:

| Workspace | Result |
|---|---|
| a `Cargo.toml` with no `[workspace]` table | a manifest error naming that `Cargo.toml` |
| a `Cargo.toml` whose members are `["crates/*"]` | a manifest error naming that `Cargo.toml` |
| a member whose `src/lib.rs` holds the bytes `0xff 0xfe` | a read error naming that `lib.rs` |

### Requirement: No runtime Node
No crate of this repository's Rust workspace SHALL spawn Node at runtime.
A corpus test runs `workspace_node_spawns` on the repository root and
fails, naming each file, line and program, when it finds any spawn, so
`sh scripts/verify-rust.sh` blocks a change that adds one. Its fast
counterpart is "Fixture workspace".

#### Scenario: Workspace spawns no Node
- **WHEN** `workspace_node_spawns` scans this repository's root
- **THEN** it returns no spawn

### Requirement: Code tags
`code_tags(file, source)` SHALL parse the Rust source text `source` with
`syn` and return its `CodeTags`: the tags of the file itself and every
item it declares, as a `CodeItem { name, line, public, test, tags }`, in
source order. A source that does not parse is `ScanError::Parse` naming
`file` and the line `syn` reports.

The items are the functions, structs, enums, unions, traits, type
aliases, constants, statics and modules declared at the top of the file
or inside an inline module, and the functions and constants inside an
`impl` block or a trait. An item inside an inline module is named
`<module>::<name>`. A trait's function is named `<Trait>::<name>`. An
`impl` block's item is named `<Type>::<name>`, or `<<Type> as
<Trait>>::<name>` in a trait `impl`, where `<Type>` and `<Trait>` are the
last segment of the self type's and the trait's paths, and `<Type>` is
`_` when the self type is not a path. `line` is the line of the item's
name. An item is `public` when it, or the trait that declares it, is
declared with a bare `pub`. A function is a `test` when one of its
attributes is a path whose last segment is `test`, such as `#[test]` or
`#[tokio::test]`. Items inside a function body and the bodies of
`macro_rules!` definitions are not read. In any other macro invoked at
item level, such as `proptest!`, each `fn <name>` among the macro's
top-level tokens is a function that is never public, and the `#[...]`
attributes directly before it, with only `pub`, `async`, `const` or
`unsafe` between, are its attributes.

A tag is a line of a doc attribute, written as `///`, `//!` or
`#[doc = "..."]`, whose text, trimmed, starts with `Implements:`,
`Covers:` or `Adr:`. Its `kind` is that word, its `target` is the trimmed
rest of the line, and its `line` is the line where its attribute starts.
An item's outer doc attributes give its tags; the inner doc attributes of
the file and of each inline module give the file's tags. A line that
names a tag word anywhere else is not a tag.

#### Scenario: Items of the tags fixture
- **WHEN** `code_tags` reads `crates/kernel/linter/tests/fixtures/code-tags/lib.rs`
- **THEN** its file tags are `Implements` `tools/file-level` at line 3 and `Implements` `tools/inner-module` at line 77, and its items are, in order:

| Name | Line | Public | Test | Tags |
|---|---|---|---|---|
| `declared` | 6 | false | false | none |
| `add` | 12 | true | false | `Implements` `tools/adds-numbers` at 10, `Adr` `22` at 11 |
| `helper` | 19 | false | false | none |
| `Total` | 22 | true | false | none |
| `Total::value` | 28 | true | false | `Implements` `tools/reads-totals` at 27 |
| `Total::reset` | 33 | false | false | none |
| `<Total as Display>::fmt` | 40 | false | false | none |
| `<_ as Named>::name` | 47 | false | false | none |
| `Named` | 53 | true | false | none |
| `Named::name` | 57 | true | false | `Implements` `tools/names` at 56 |
| `Kind` | 61 | true | false | none |
| `Alias` | 67 | true | false | none |
| `LIMIT` | 70 | true | false | none |
| `COUNTER` | 73 | false | false | none |
| `inner` | 76 | true | false | none |
| `inner::double` | 82 | false | false | `Implements` `tools/doubles` at 81, `Adr` `9` at 81 |
| `two_plus_two` | 91 | false | true | `Covers` `tools/two-plus-two` at 89 |
| `later_sums` | 97 | false | true | `Covers` `tools/later-sums` at 95 |
| `any_sum` | 106 | false | true | `Covers` `tools/any-sum` at 104 |
| `mention` | 120 | true | false | none |

#### Scenario: Unparsable tag source
- **WHEN** `code_tags` reads the source `fn main( {\n` as `src/lib.rs`
- **THEN** the result is a parse error naming `src/lib.rs`

### Requirement: Link graph build
`build_link_graph(root, decisions, openspec)` SHALL build ADR 024's link
graph for the project at `root` from its files, with `decisions` and
`openspec` the project-relative folders of its ADRs and its specs. It
adds, in this order:

1. One `Adr` node per ADR that `read_decisions` reads, keyed by its number
   as written, named by its title, at its path with no line, with its
   status. For each ADR, in read order: an `applies_to` edge per
   `applies_to` entry, to `group:<name>` for a `group:<name>` entry and
   to `capability:<entry>` otherwise, none for `all`; a `governs` edge
   to each capability its `governs` names, or to every capability node
   when it governs all; and, when it has `superseded_by`, a `supersedes`
   edge to it from the ADR that number names. Each of these edges is at
   the ADR's path with no line.
2. One `Capability` node per folder directly under `<openspec>/specs`
   that holds a `spec.md`, in folder name order by bytes, read with
   `read_living_spec`, named by the folder and at that `spec.md` with no
   line. For each requirement, a `Requirement` node keyed
   `<capability>/<tag_id(name)>` and named by the requirement's name,
   then a `Scenario` node for each of its scenarios, keyed
   `<capability>/<tag_id(name)>` and named by the scenario's name, all at
   that `spec.md` with no line. Then one `Group` node, with no location,
   per distinct group in the decision records' groups, in byte order.
3. One `File` node per Rust file of the Cargo workspace at `root`: for
   each member, in the order the root `Cargo.toml` lists them, every
   `.rs` file under its `src/` and `tests/` folders, at any depth, except
   under `tests/fixtures/`, in byte order of their paths. Its key is the
   path relative to `root` written with `/`. For each file, after its
   `File` node, its `code_tags` items in source order: a `Test` node for
   a test and an `Item` node otherwise, keyed `<file>::<item name>`,
   named by the item name, at the file and the item's line, with
   `public` as `code_tags` gives it. Then the file's tags, as edges from
   its `File` node, and each item's tags, as edges from the item's node,
   at the file and the tag's line: `Implements` is an `implements` edge to
   `requirement:<target>`, `Covers` a `covers` edge to
   `scenario:<target>`, and `Adr` a `governs` edge to the item's or
   file's node from the ADR the target names.
4. For each capability `read_capability_ownership` returns, in its order,
   an `owns` edge to each `File` node, in id order, whose path its globs
   cover under `scope_covers_path`, at the capability's `spec.md` with no
   line.

A tag target is kept as written, so a target that names no node gives a
dangling edge. A number names the first ADR, in read order, whose number
is the same value when both are ASCII digits, such as `3` naming `003`,
and is kept as written otherwise. An error reading the workspace or a
source is the `ScanError` as `GraphError::Scan`, and an error reading a
living spec is the `SpecsError` as `GraphError::Specs`; each displays as
the error it holds.

#### Scenario: Nodes of the link graph fixture
- **WHEN** `build_link_graph` builds `crates/kernel/linter/tests/fixtures/link-graph/` with `decisions` and `openspec`
- **THEN** its nodes are exactly these, in id order:

| Id | Name | Location | Status | Public |
|---|---|---|---|---|
| `adr:001` | `First decision` | `decisions/001-first.md` | `superseded` | false |
| `adr:002` | `Everything` | `decisions/002-everything.md` | `accepted` | false |
| `adr:003` | `Third decision` | `decisions/003-third.md` | `accepted` | false |
| `capability:alpha` | `alpha` | `openspec/specs/alpha/spec.md` | none | false |
| `capability:beta` | `beta` | `openspec/specs/beta/spec.md` | none | false |
| `group:tools` | `tools` | none | none | false |
| `requirement:alpha/adds-numbers` | `Adds Numbers` | `openspec/specs/alpha/spec.md` | none | false |
| `requirement:alpha/code-ownership` | `Code ownership` | `openspec/specs/alpha/spec.md` | none | false |
| `requirement:beta/code-ownership` | `Code ownership` | `openspec/specs/beta/spec.md` | none | false |
| `requirement:beta/formats-text` | `Formats text` | `openspec/specs/beta/spec.md` | none | false |
| `scenario:alpha/alpha-ownership` | `Alpha ownership` | `openspec/specs/alpha/spec.md` | none | false |
| `scenario:alpha/big-sums` | `Big sums` | `openspec/specs/alpha/spec.md` | none | false |
| `scenario:alpha/two-plus-two` | `Two plus two` | `openspec/specs/alpha/spec.md` | none | false |
| `scenario:beta/beta-ownership` | `Beta ownership` | `openspec/specs/beta/spec.md` | none | false |
| `scenario:beta/plain-text` | `Plain text` | `openspec/specs/beta/spec.md` | none | false |
| `file:crates/alpha/src/lib.rs` | `crates/alpha/src/lib.rs` | `crates/alpha/src/lib.rs` | none | false |
| `file:crates/alpha/src/shared.rs` | `crates/alpha/src/shared.rs` | `crates/alpha/src/shared.rs` | none | false |
| `file:crates/alpha/tests/adding.rs` | `crates/alpha/tests/adding.rs` | `crates/alpha/tests/adding.rs` | none | false |
| `file:crates/beta/src/lib.rs` | `crates/beta/src/lib.rs` | `crates/beta/src/lib.rs` | none | false |
| `item:crates/alpha/src/lib.rs::Total` | `Total` | `crates/alpha/src/lib.rs:16` | none | true |
| `item:crates/alpha/src/lib.rs::Total::value` | `Total::value` | `crates/alpha/src/lib.rs:22` | none | true |
| `item:crates/alpha/src/lib.rs::add` | `add` | `crates/alpha/src/lib.rs:11` | none | true |
| `item:crates/alpha/src/lib.rs::double` | `double` | `crates/alpha/src/lib.rs:30` | none | false |
| `item:crates/alpha/src/lib.rs::shared` | `shared` | `crates/alpha/src/lib.rs:5` | none | false |
| `item:crates/alpha/src/shared.rs::trim` | `trim` | `crates/alpha/src/shared.rs:6` | none | true |
| `item:crates/alpha/tests/adding.rs::helper` | `helper` | `crates/alpha/tests/adding.rs:20` | none | false |
| `item:crates/beta/src/lib.rs::format` | `format` | `crates/beta/src/lib.rs:7` | none | true |
| `test:crates/alpha/tests/adding.rs::any_sum` | `any_sum` | `crates/alpha/tests/adding.rs:27` | none | false |
| `test:crates/alpha/tests/adding.rs::big_sums_by_title` | `big_sums_by_title` | `crates/alpha/tests/adding.rs:15` | none | false |
| `test:crates/alpha/tests/adding.rs::two_plus_two` | `two_plus_two` | `crates/alpha/tests/adding.rs:7` | none | false |

#### Scenario: Edges of the link graph fixture
- **WHEN** `build_link_graph` builds `crates/kernel/linter/tests/fixtures/link-graph/` with `decisions` and `openspec`
- **THEN** its edges are exactly these, in this order:

| Kind | From | To | Location |
|---|---|---|---|
| `applies_to` | `adr:001` | `capability:alpha` | `decisions/001-first.md` |
| `applies_to` | `adr:001` | `group:tools` | `decisions/001-first.md` |
| `applies_to` | `adr:001` | `capability:ghost` | `decisions/001-first.md` |
| `governs` | `adr:001` | `capability:alpha` | `decisions/001-first.md` |
| `governs` | `adr:001` | `capability:ghost` | `decisions/001-first.md` |
| `supersedes` | `adr:003` | `adr:001` | `decisions/001-first.md` |
| `governs` | `adr:002` | `capability:alpha` | `decisions/002-everything.md` |
| `governs` | `adr:002` | `capability:beta` | `decisions/002-everything.md` |
| `applies_to` | `adr:003` | `group:tools` | `decisions/003-third.md` |
| `applies_to` | `adr:003` | `capability:beta` | `decisions/003-third.md` |
| `applies_to` | `adr:003` | `group:nobody` | `decisions/003-third.md` |
| `governs` | `adr:003` | `capability:alpha` | `decisions/003-third.md` |
| `governs` | `adr:003` | `capability:beta` | `decisions/003-third.md` |
| `supersedes` | `adr:7` | `adr:003` | `decisions/003-third.md` |
| `implements` | `file:crates/alpha/src/lib.rs` | `requirement:alpha/code-ownership` | `crates/alpha/src/lib.rs:3` |
| `implements` | `item:crates/alpha/src/lib.rs::add` | `requirement:alpha/adds-numbers` | `crates/alpha/src/lib.rs:9` |
| `governs` | `adr:002` | `item:crates/alpha/src/lib.rs::add` | `crates/alpha/src/lib.rs:10` |
| `implements` | `item:crates/alpha/src/lib.rs::Total::value` | `requirement:alpha/missing-requirement` | `crates/alpha/src/lib.rs:21` |
| `governs` | `adr:9` | `item:crates/alpha/src/lib.rs::double` | `crates/alpha/src/lib.rs:29` |
| `implements` | `item:crates/alpha/src/shared.rs::trim` | `requirement:beta/formats-text` | `crates/alpha/src/shared.rs:5` |
| `covers` | `test:crates/alpha/tests/adding.rs::two_plus_two` | `scenario:alpha/two-plus-two` | `crates/alpha/tests/adding.rs:5` |
| `covers` | `test:crates/alpha/tests/adding.rs::big_sums_by_title` | `scenario:alpha/Big sums` | `crates/alpha/tests/adding.rs:13` |
| `covers` | `item:crates/alpha/tests/adding.rs::helper` | `scenario:alpha/two-plus-two` | `crates/alpha/tests/adding.rs:19` |
| `covers` | `test:crates/alpha/tests/adding.rs::any_sum` | `scenario:alpha/big-sums` | `crates/alpha/tests/adding.rs:25` |
| `implements` | `item:crates/beta/src/lib.rs::format` | `requirement:beta/formats-text` | `crates/beta/src/lib.rs:5` |
| `implements` | `item:crates/beta/src/lib.rs::format` | `requirement:alpha/adds-numbers` | `crates/beta/src/lib.rs:6` |
| `owns` | `capability:alpha` | `file:crates/alpha/src/lib.rs` | `openspec/specs/alpha/spec.md` |
| `owns` | `capability:alpha` | `file:crates/alpha/src/shared.rs` | `openspec/specs/alpha/spec.md` |
| `owns` | `capability:alpha` | `file:crates/alpha/tests/adding.rs` | `openspec/specs/alpha/spec.md` |
| `owns` | `capability:beta` | `file:crates/alpha/src/shared.rs` | `openspec/specs/beta/spec.md` |
| `owns` | `capability:beta` | `file:crates/beta/src/lib.rs` | `openspec/specs/beta/spec.md` |

#### Scenario: Dangling edges of the link graph fixture
- **WHEN** `dangling` is read on the graph of the link graph fixture
- **THEN** it lists, in order, the edges to `capability:ghost` (`applies_to`, then `governs`), the `applies_to` edge to `group:nobody`, the `supersedes` edge from `adr:7`, the `implements` edge to `requirement:alpha/missing-requirement`, the `governs` edge from `adr:9` and the `covers` edge to `scenario:alpha/Big sums`

#### Scenario: Link graph rebuilds the same
- **WHEN** `build_link_graph` builds the link graph fixture twice
- **THEN** the two graphs are equal

#### Scenario: Link graph errors
- **WHEN** each project below, written under a temporary folder, is built
- **THEN** the result is as given:

| Project | Result |
|---|---|
| a `Cargo.toml` with no `[workspace]` table | a scan manifest error naming that `Cargo.toml` |
| a member whose `src/lib.rs` holds `fn main( {\n` | a scan parse error naming that `lib.rs` |
| a workspace whose `openspec/specs/alpha/spec.md` holds the bytes `0xff 0xfe` | a specs read error naming that `spec.md` |
| a workspace with one member, no `decisions` folder and no `openspec` folder | a graph with no `Adr`, `Capability` or `Group` node |

### Requirement: Live link graph
`build_link_graph` SHALL build this repository's link graph with
`decisions` and `openspec`, and every tag in its Rust files SHALL become
an edge. A corpus test checks that the graph has one `Adr` node per ADR
`read_decisions` reads and one `Capability` node per folder under
`openspec/specs` with a `spec.md`, and that, over the files of its `File`
nodes, the `implements` edges with a location number the lines that,
trimmed, start with `/// Implements:` or `//! Implements:`, the `covers`
edges the lines that start with `/// Covers:`, and the `governs` edges to
an `Item`, `Test` or `File` node the lines that start with `/// Adr:` or
`//! Adr:`. On a mismatch it names each file whose counts differ. Its
fast counterparts are "Items of the tags fixture" and "Edges of the link
graph fixture".

#### Scenario: Live tags become edges
- **WHEN** `build_link_graph` builds this repository's root
- **THEN** it succeeds, its `Adr` and `Capability` nodes match the decisions and living specs, and its tag edges match the tag lines of its files, with at least one `implements` and one `covers` edge
