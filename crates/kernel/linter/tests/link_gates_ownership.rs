//! Link gates over the link gates ownership fixture.

use std::path::{Path, PathBuf};

use osq_core::{Finding, Location, NodeId};
use osq_kernel_linter::{change_link_gates, link_gates};

/// The fix for a file no capability owns.
const ADD_FIX: &str = "Add the file to one capability's Code ownership globs.";
/// The fix for a file more than one capability owns.
const KEEP_FIX: &str = "Keep the file in one capability's Code ownership globs.";

/// The copied link gates ownership fixture project.
fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/link-gates-ownership")
}

/// Runs `link_gates` over the fixture with the `tools` group.
fn fixture_findings() -> Vec<Finding> {
    link_gates(
        &fixture_root(),
        Path::new("decisions"),
        Path::new("openspec"),
        "tools",
    )
    .expect("the fixture builds")
}

/// Runs `change_link_gates` over the fixture with the `tools` group.
fn change_findings(change: &str) -> Vec<Finding> {
    change_link_gates(
        &fixture_root(),
        Path::new("decisions"),
        Path::new("openspec"),
        "tools",
        Path::new(change),
    )
    .expect("the fixture builds")
}

/// One expected `owned-once` finding row.
struct FindingRow {
    /// The rule's name.
    rule: &'static str,
    /// The node the finding is about.
    node: NodeId,
    /// Where the finding is stated.
    location: Option<Location>,
    /// The finding's display.
    display: String,
    /// The finding's fix.
    fix: String,
}

/// Builds one `owned-once` finding row for a file path.
fn owned_once(path: &str, message: &str, fix: &str) -> FindingRow {
    FindingRow {
        rule: "owned-once",
        node: NodeId::File(path.to_owned()),
        location: Some(Location {
            file: path.to_owned(),
            line: None,
        }),
        display: format!("{path}: {message}"),
        fix: fix.to_owned(),
    }
}

/// Checks findings row by row, naming the first row that differs.
fn check_rows(actual: &[Finding], expected: &[FindingRow]) {
    assert_eq!(
        actual.len(),
        expected.len(),
        "finding count differs: got {}, expected {}",
        actual.len(),
        expected.len()
    );
    for (index, (got, row)) in actual.iter().zip(expected).enumerate() {
        assert_eq!(got.rule, row.rule, "rule of finding {index} differs");
        assert_eq!(got.node, row.node, "node of finding {index} differs");
        assert_eq!(
            got.location, row.location,
            "location of finding {index} differs"
        );
        assert_eq!(
            got.to_string(),
            row.display,
            "display of finding {index} differs"
        );
        assert_eq!(got.fix, row.fix, "fix of finding {index} differs");
    }
}

/// Covers: rust-linter/findings-of-the-link-gates-ownership-fixture
#[test]
fn findings_of_the_link_gates_ownership_fixture() {
    check_rows(
        &fixture_findings(),
        &[owned_once(
            "crates/fresh/src/lib.rs",
            "owned by no capability",
            ADD_FIX,
        )],
    );
}

/// Covers: rust-linter/a-change-moves-ownership-to-a-new-capability
#[test]
fn a_change_moves_ownership_to_a_new_capability() {
    check_rows(
        &change_findings("openspec/changes/001-split"),
        &[owned_once(
            "crates/fresh/src/lib.rs",
            "owned by no capability",
            ADD_FIX,
        )],
    );
}

/// Covers: rust-linter/a-new-capability-s-ownership-overlaps-a-living-one
#[test]
fn a_new_capability_s_ownership_overlaps_a_living_one() {
    check_rows(
        &change_findings("openspec/changes/002-fresh"),
        &[owned_once(
            "crates/keep/src/lib.rs",
            "owned by fresh, keep",
            KEEP_FIX,
        )],
    );
}
