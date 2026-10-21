## MODIFIED Requirements

### Requirement: Change ownership
`change_link_gates` SHALL build the link graph with the Code ownership the
change in flight gives, so the files of a capability the change creates are
owned during its own run. Before the `owns` edges are added, it reads each
`spec.md` directly under the change's `specs` folder with `read_delta`, the
folder's name being the capability. A capability whose delta ADDS or
MODIFIES a requirement named `Code ownership` owns the globs `code_ownership`
reads from that requirement's text in place of its living globs, whether or
not it has a living spec. A capability whose delta REMOVES a requirement
named `Code ownership`, and neither adds nor modifies one, owns no globs
during the change's run, as archive will leave it. Every other capability
keeps the globs
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

#### Scenario: A change removes a capability's ownership
- **WHEN** `change_link_gates` runs on the link gates ownership fixture with `decisions`, `openspec`, the group `tools` and the change `openspec/changes/003-retire`, whose `keep` delta REMOVES `Code ownership` and whose `fresh` delta ADDS `Code ownership` with `crates/fresh/**`, `crates/keep/**` and `crates/split/**`
- **THEN** it returns no finding

#### Scenario: Removed ownership with no new owner
- **WHEN** `change_link_gates` runs on the link gates ownership fixture with the change `openspec/changes/004-orphan`, whose `keep` delta REMOVES `Code ownership` and which has no other delta
- **THEN** it returns exactly three `owned-once` findings, one each for `crates/fresh/src/lib.rs`, `crates/keep/src/lib.rs` and `crates/split/src/lib.rs`, each displayed `<path>: owned by no capability`
