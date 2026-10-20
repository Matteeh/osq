## ADDED Requirements

### Requirement: Change ownership
`change_link_gates` SHALL build the link graph with the Code ownership the
change in flight gives, so the files of a capability the change creates are
owned during its own run. Before the `owns` edges are added, it reads each
`spec.md` directly under the change's `specs` folder with `read_delta`, the
folder's name being the capability. A capability whose delta ADDS or
MODIFIES a requirement named `Code ownership` owns the globs `code_ownership`
reads from that requirement's text in place of its living globs, whether or
not it has a living spec. Every other capability keeps the globs
`read_capability_ownership` gives it. The `owns` edges are then added as
step 4 of "Link graph build" says, one capability at a time in byte order of
the names, each edge at `<openspec>/specs/<capability>/spec.md` with no
line. `link_gates` and `build_link_graph` keep the living globs only.

#### Scenario: Findings of the link gates ownership fixture
- **WHEN** `link_gates` runs on `crates/kernel/linter/tests/fixtures/link-gates-ownership/` with `decisions`, `openspec` and the group `tools`
- **THEN** it returns exactly one finding: rule `owned-once`, node `file:crates/fresh/src/lib.rs`, display `crates/fresh/src/lib.rs: owned by no capability`, fix `Add the file to one capability's Code ownership globs.`

#### Scenario: A change moves ownership to a new capability
- **WHEN** `change_link_gates` runs on the link gates ownership fixture with `decisions`, `openspec`, the group `tools` and the change `openspec/changes/001-split`, whose `keep` delta MODIFIES `Code ownership` to `crates/keep/**` and whose `split` delta ADDS `Code ownership` with `crates/split/**` after another requirement
- **THEN** it returns exactly the one finding of "Findings of the link gates ownership fixture"

#### Scenario: A new capability's ownership overlaps a living one
- **WHEN** `change_link_gates` runs on the link gates ownership fixture with `decisions`, `openspec`, the group `tools` and the change `openspec/changes/002-fresh`, whose `fresh` delta ADDS `Code ownership` with `crates/fresh/**` and `crates/keep/src/lib.rs`
- **THEN** it returns exactly one finding: rule `owned-once`, node `file:crates/keep/src/lib.rs`, display `crates/keep/src/lib.rs: owned by fresh, keep`, fix `Keep the file in one capability's Code ownership globs.`

## MODIFIED Requirements

### Requirement: Live link gates
This repository's Rust crates SHALL break none of the four link rules. A
corpus test runs the gates on the repository root with `decisions`,
`openspec` and the group `rust`: `change_link_gates` with the folder the
`OSQ_CHANGE` environment variable names when it is set and not empty, as
osq sets it for every verify of a change, and `link_gates` otherwise. It
fails, printing each finding with its fix, when they return any finding,
`owned-once` included, so `sh scripts/verify-rust.sh` blocks a change that
breaks a rule, while a tag naming what the change itself adds, and a file
of a capability the change creates, pass. Every repository gate that a
change's verify runs takes the change in flight as an input in the same
way, so a change never fails a gate over something its own delta fixes.
Its fast counterparts are "Findings of the link gates fixture", "Link
gates with a change" and "A change moves ownership to a new capability".

#### Scenario: Repository passes the link gates
- **WHEN** the link gates run on this repository's root with the group `rust`, and with the change `OSQ_CHANGE` names when it is set
- **THEN** they succeed and return no finding of any rule
