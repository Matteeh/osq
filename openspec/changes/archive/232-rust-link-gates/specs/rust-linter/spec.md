# Spec Delta: rust-linter

## MODIFIED Requirements

### Requirement: Code tags
`code_tags(file, source)` SHALL parse the Rust source text `source` with
`syn` and return its `CodeTags`: the tags of the file itself and every
item it declares, as a `CodeItem { name, line, public, function, test,
tags }`, in source order. A source that does not parse is
`ScanError::Parse` naming `file` and the line `syn` reports.

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
declared with a bare `pub`. An item is a `function` when it is a
function, at the top of the file, in an inline module, in an `impl`
block or in a trait. A function is a `test` when one of its
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

| Name | Line | Public | Function | Test | Tags |
|---|---|---|---|---|---|
| `declared` | 6 | false | false | false | none |
| `add` | 12 | true | true | false | `Implements` `tools/adds-numbers` at 10, `Adr` `22` at 11 |
| `helper` | 19 | false | true | false | none |
| `Total` | 22 | true | false | false | none |
| `Total::value` | 28 | true | true | false | `Implements` `tools/reads-totals` at 27 |
| `Total::reset` | 33 | false | true | false | none |
| `<Total as Display>::fmt` | 40 | false | true | false | none |
| `<_ as Named>::name` | 47 | false | true | false | none |
| `Named` | 53 | true | false | false | none |
| `Named::name` | 57 | true | true | false | `Implements` `tools/names` at 56 |
| `Kind` | 61 | true | false | false | none |
| `Alias` | 67 | true | false | false | none |
| `LIMIT` | 70 | true | false | false | none |
| `COUNTER` | 73 | false | false | false | none |
| `inner` | 76 | true | false | false | none |
| `inner::double` | 82 | false | true | false | `Implements` `tools/doubles` at 81, `Adr` `9` at 81 |
| `two_plus_two` | 91 | false | true | true | `Covers` `tools/two-plus-two` at 89 |
| `later_sums` | 97 | false | true | true | `Covers` `tools/later-sums` at 95 |
| `any_sum` | 106 | false | true | true | `Covers` `tools/any-sum` at 104 |
| `mention` | 120 | true | true | false | none |

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
   `public` and `function` as `code_tags` gives them. Then the file's
   tags, as edges from its `File` node, and each item's tags, as edges
   from the item's node, at the file and the tag's line: `Implements` is
   an `implements` edge to `requirement:<target>`, `Covers` a `covers`
   edge to `scenario:<target>`, and `Adr` a `governs` edge to the item's
   or file's node from the ADR the target names.
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

| Id | Name | Location | Status | Public | Function |
|---|---|---|---|---|---|
| `adr:001` | `First decision` | `decisions/001-first.md` | `superseded` | false | false |
| `adr:002` | `Everything` | `decisions/002-everything.md` | `accepted` | false | false |
| `adr:003` | `Third decision` | `decisions/003-third.md` | `accepted` | false | false |
| `capability:alpha` | `alpha` | `openspec/specs/alpha/spec.md` | none | false | false |
| `capability:beta` | `beta` | `openspec/specs/beta/spec.md` | none | false | false |
| `group:tools` | `tools` | none | none | false | false |
| `requirement:alpha/adds-numbers` | `Adds Numbers` | `openspec/specs/alpha/spec.md` | none | false | false |
| `requirement:alpha/code-ownership` | `Code ownership` | `openspec/specs/alpha/spec.md` | none | false | false |
| `requirement:beta/code-ownership` | `Code ownership` | `openspec/specs/beta/spec.md` | none | false | false |
| `requirement:beta/formats-text` | `Formats text` | `openspec/specs/beta/spec.md` | none | false | false |
| `scenario:alpha/alpha-ownership` | `Alpha ownership` | `openspec/specs/alpha/spec.md` | none | false | false |
| `scenario:alpha/big-sums` | `Big sums` | `openspec/specs/alpha/spec.md` | none | false | false |
| `scenario:alpha/two-plus-two` | `Two plus two` | `openspec/specs/alpha/spec.md` | none | false | false |
| `scenario:beta/beta-ownership` | `Beta ownership` | `openspec/specs/beta/spec.md` | none | false | false |
| `scenario:beta/plain-text` | `Plain text` | `openspec/specs/beta/spec.md` | none | false | false |
| `file:crates/alpha/src/lib.rs` | `crates/alpha/src/lib.rs` | `crates/alpha/src/lib.rs` | none | false | false |
| `file:crates/alpha/src/shared.rs` | `crates/alpha/src/shared.rs` | `crates/alpha/src/shared.rs` | none | false | false |
| `file:crates/alpha/tests/adding.rs` | `crates/alpha/tests/adding.rs` | `crates/alpha/tests/adding.rs` | none | false | false |
| `file:crates/beta/src/lib.rs` | `crates/beta/src/lib.rs` | `crates/beta/src/lib.rs` | none | false | false |
| `item:crates/alpha/src/lib.rs::Total` | `Total` | `crates/alpha/src/lib.rs:16` | none | true | false |
| `item:crates/alpha/src/lib.rs::Total::value` | `Total::value` | `crates/alpha/src/lib.rs:22` | none | true | true |
| `item:crates/alpha/src/lib.rs::add` | `add` | `crates/alpha/src/lib.rs:11` | none | true | true |
| `item:crates/alpha/src/lib.rs::double` | `double` | `crates/alpha/src/lib.rs:30` | none | false | true |
| `item:crates/alpha/src/lib.rs::shared` | `shared` | `crates/alpha/src/lib.rs:5` | none | false | false |
| `item:crates/alpha/src/shared.rs::trim` | `trim` | `crates/alpha/src/shared.rs:6` | none | true | true |
| `item:crates/alpha/tests/adding.rs::helper` | `helper` | `crates/alpha/tests/adding.rs:20` | none | false | true |
| `item:crates/beta/src/lib.rs::format` | `format` | `crates/beta/src/lib.rs:7` | none | true | true |
| `test:crates/alpha/tests/adding.rs::any_sum` | `any_sum` | `crates/alpha/tests/adding.rs:27` | none | false | true |
| `test:crates/alpha/tests/adding.rs::big_sums_by_title` | `big_sums_by_title` | `crates/alpha/tests/adding.rs:15` | none | false | true |
| `test:crates/alpha/tests/adding.rs::two_plus_two` | `two_plus_two` | `crates/alpha/tests/adding.rs:7` | none | false | true |

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

## ADDED Requirements

### Requirement: Link gates
The linter kernel SHALL hold four link rules, each a core `Rule` over the
link graph, for the rules ADR 024 section 3 lists as holding for the
repository as a whole. Every finding names the rule, the node it is
about, the place in the files that states it and one fix. The rules are:

- `owned-once`, the unit struct `OwnedOnce`: for each `File` node, in id
  order, one finding at the file's location when no `owns` edge reaches
  it, with the message `owned by no capability` and the fix `Add the
  file to one capability's Code ownership globs.`, and one when two or
  more do, with the message `owned by <capabilities>`, the owning
  capability names joined by `, ` in edge order, and the fix `Keep the
  file in one capability's Code ownership globs.`
- `complete-capabilities`, the struct `CompleteCapabilities` holding the
  capabilities in scope as `ScopedCapability { name, purpose }`, with
  `purpose` true when that capability's living spec has a Purpose: for
  each scoped capability, in the order held, that has a `Capability`
  node, at that node's location and in this order, a finding with the
  message `<name> has no Purpose` and the fix `Write a Purpose section
  in the capability's spec.md.` when `purpose` is false, one with the
  message `<name> has no requirement` and the fix `Add a requirement to
  the capability's spec.md.` when no `Requirement` node's key starts
  with `<name>/`, and one with the message `<name> owns no file` and the
  fix `Add a Code ownership requirement whose globs cover the
  capability's files.` when no `owns` edge leaves it.
- `live-references`, the unit struct `LiveReferences`: for each edge, in
  added order, whose kind is below, one finding at the edge's location
  when the end it names has no node, with the message `<word> names
  <id>, which does not exist`, or when that end is an ADR whose status
  is not `accepted`, with the message `<word> names <id>, which is
  <status>`. The finding is about the edge's other end. `governs` edges
  to a `Capability` node come from `applies_to` and are not checked, nor
  are edges of other kinds.

| Kind | Named end | Word | Fix |
|---|---|---|---|
| `applies_to` | `to` | `applies_to` | `Name a living capability, or a group as group:<name>.` |
| `supersedes` | `from` | `superseded_by` | `Name an accepted ADR.` |
| `governs` | `from` | `Adr: tag` | `Name an accepted ADR.` |
| `implements` | `to` | `Implements: tag` | `Name a living requirement as <capability>/<requirement name in kebab-case>.` |
| `covers` | `to` | `Covers: tag` | `Name a living scenario as <capability>/<scenario name in kebab-case>.` |

- `tagged-functions`, the unit struct `TaggedFunctions`: for each `Item`
  node, in id order, that is public and a function, whose location's
  file has a folder named `src` and none named `tests`, and from which
  no `implements` edge leaves, one finding at the item's location with
  the message `public function <name> has no Implements: tag` and the
  fix `End its doc with Implements: <capability>/<requirement name in
  kebab-case>.`

`link_gates(root, decisions, openspec, group)` SHALL build the link graph
with `build_link_graph`, scope `complete-capabilities` to the
`Capability` nodes, in id order, whose sidecar group in `read_decisions`
is `group`, reading each one's Purpose with `read_living_spec`, and
return `run_rules` over the four rules in the order above. An error
building the graph or reading a living spec is the `GraphError` it gives.

`change_link_gates(root, decisions, openspec, group, change)` SHALL do
the same for a change in flight, whose folder is `change` joined onto
`root`. Before the rules run, it reads each `spec.md` directly under the
change's `specs` folder with `read_delta`, the folder's name being the
capability, and adds to the graph a `Requirement` node for each
requirement the delta ADDS or MODIFIES and each name it RENAMES to, and a
`Scenario` node for each scenario of an ADDED or MODIFIED requirement,
keyed `<capability>/<tag id of the name>`, so a tag naming what the
change adds is live. A node already in the graph is kept. A change with
no `specs` folder adds nothing, and a delta that cannot be read is the
`GraphError::Specs` it gives.

#### Scenario: Findings of the link gates fixture
- **WHEN** `link_gates` runs on `crates/kernel/linter/tests/fixtures/link-gates/` with `decisions`, `openspec` and the group `tools`
- **THEN** it returns exactly these findings, in this order:

| Rule | Node | Display | Fix |
|---|---|---|---|
| `owned-once` | `file:crates/alpha/src/shared.rs` | `crates/alpha/src/shared.rs: owned by alpha, beta` | `Keep the file in one capability's Code ownership globs.` |
| `owned-once` | `file:crates/beta/src/lib.rs` | `crates/beta/src/lib.rs: owned by no capability` | `Add the file to one capability's Code ownership globs.` |
| `complete-capabilities` | `capability:beta` | `openspec/specs/beta/spec.md: beta has no Purpose` | `Write a Purpose section in the capability's spec.md.` |
| `complete-capabilities` | `capability:gamma` | `openspec/specs/gamma/spec.md: gamma has no requirement` | `Add a requirement to the capability's spec.md.` |
| `complete-capabilities` | `capability:gamma` | `openspec/specs/gamma/spec.md: gamma owns no file` | `Add a Code ownership requirement whose globs cover the capability's files.` |
| `live-references` | `adr:001` | `decisions/001-tools.md: applies_to names capability:ghost, which does not exist` | `Name a living capability, or a group as group:<name>.` |
| `live-references` | `adr:002` | `decisions/002-old.md: superseded_by names adr:003, which is proposed` | `Name an accepted ADR.` |
| `live-references` | `item:crates/alpha/src/lib.rs::add` | `crates/alpha/src/lib.rs:8: Adr: tag names adr:002, which is superseded` | `Name an accepted ADR.` |
| `live-references` | `item:crates/alpha/src/lib.rs::Total::value` | `crates/alpha/src/lib.rs:24: Implements: tag names requirement:alpha/reads-totals, which does not exist` | `Name a living requirement as <capability>/<requirement name in kebab-case>.` |
| `live-references` | `test:crates/alpha/tests/adding.rs::two_plus_two_by_title` | `crates/alpha/tests/adding.rs:13: Covers: tag names scenario:alpha/Two plus two, which does not exist` | `Name a living scenario as <capability>/<scenario name in kebab-case>.` |
| `live-references` | `item:crates/beta/src/lib.rs::format` | `crates/beta/src/lib.rs:6: Adr: tag names adr:9, which does not exist` | `Name an accepted ADR.` |
| `tagged-functions` | `item:crates/alpha/src/lib.rs::Total::reset` | `crates/alpha/src/lib.rs:30: public function Total::reset has no Implements: tag` | `End its doc with Implements: <capability>/<requirement name in kebab-case>.` |
| `tagged-functions` | `item:crates/alpha/src/lib.rs::subtract` | `crates/alpha/src/lib.rs:14: public function subtract has no Implements: tag` | `End its doc with Implements: <capability>/<requirement name in kebab-case>.` |

#### Scenario: Link gates in another group
- **WHEN** `link_gates` runs on the link gates fixture with the group `other`
- **THEN** its only `complete-capabilities` finding is about `capability:notes`, displayed as `openspec/specs/notes/spec.md: notes owns no file`, and its `owned-once`, `live-references` and `tagged-functions` findings are those of "Findings of the link gates fixture", in the same order

#### Scenario: Link gate errors
- **WHEN** `link_gates` runs on a temporary project whose `Cargo.toml` has no `[workspace]` table
- **THEN** the result is a scan manifest error naming that `Cargo.toml`

#### Scenario: Findings of the link gates change fixture
- **WHEN** `link_gates` runs on `crates/kernel/linter/tests/fixtures/link-gates-change/` with `decisions`, `openspec` and the group `tools`
- **THEN** it returns exactly these `live-references` findings, in this order, and no other finding:

| Node | Display |
|---|---|
| `item:crates/delta/src/lib.rs::read` | `crates/delta/src/lib.rs:12: Implements: tag names requirement:delta/reads-totals, which does not exist` |
| `item:crates/delta/src/lib.rs::clear` | `crates/delta/src/lib.rs:19: Implements: tag names requirement:delta/clears-totals, which does not exist` |
| `item:crates/delta/src/lib.rs::sum` | `crates/delta/src/lib.rs:26: Implements: tag names requirement:delta/sums-lists, which does not exist` |
| `test:crates/delta/tests/totals.rs::zero_plus_two` | `crates/delta/tests/totals.rs:11: Covers: tag names scenario:delta/zero-plus-two, which does not exist` |
| `test:crates/delta/tests/totals.rs::read_after_add` | `crates/delta/tests/totals.rs:17: Covers: tag names scenario:delta/read-after-add, which does not exist` |

#### Scenario: Link gates with a change
- **WHEN** `change_link_gates` runs on the link gates change fixture with `decisions`, `openspec`, the group `tools` and the change `openspec/changes/001-totals`
- **THEN** it returns exactly one finding, the `live-references` finding about `item:crates/delta/src/lib.rs::sum` from "Findings of the link gates change fixture"

#### Scenario: Link gates with a change that has no specs
- **WHEN** `change_link_gates` runs on the link gates change fixture with the change `openspec/changes/002-missing`, which does not exist
- **THEN** it returns the findings of "Findings of the link gates change fixture", in the same order

### Requirement: Live link gates
This repository's Rust crates SHALL break none of the link rules
`complete-capabilities`, `live-references` and `tagged-functions`. A
corpus test runs the gates on the repository root with `decisions`,
`openspec` and the group `rust`: `change_link_gates` with the folder the
`OSQ_CHANGE` environment variable names when it is set and not empty, as
osq sets it for every verify of a change, and `link_gates` otherwise. It
fails, printing each finding with its fix, when they return any finding
of those three rules, so `sh scripts/verify-rust.sh` blocks a change that
breaks one, while a tag naming what the change itself adds stays live.
Its fast counterparts are "Findings of the link gates fixture" and "Link
gates with a change".

#### Scenario: Repository passes the link gates
- **WHEN** the link gates run on this repository's root with the group `rust`, and with the change `OSQ_CHANGE` names when it is set
- **THEN** they succeed and return no finding of the rules `complete-capabilities`, `live-references` and `tagged-functions`
