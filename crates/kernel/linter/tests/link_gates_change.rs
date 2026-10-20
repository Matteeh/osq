//! Link gates over the link gates change fixture.

use std::path::{Path, PathBuf};

use osq_core::{Finding, Location, NodeId};
use osq_kernel_linter::{change_link_gates, link_gates};

/// The delta library's path.
const DELTA_LIB: &str = "crates/delta/src/lib.rs";
/// The delta test file's path.
const DELTA_TOTALS: &str = "crates/delta/tests/totals.rs";

/// The fix for a broken `Implements:` tag.
const IMPLEMENTS_FIX: &str =
    "Name a living requirement as <capability>/<requirement name in kebab-case>.";
/// The fix for a broken `Covers:` tag.
const COVERS_FIX: &str = "Name a living scenario as <capability>/<scenario name in kebab-case>.";

/// The copied link gates change fixture project.
fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/link-gates-change")
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

/// One expected finding row.
struct FindingRow {
    /// The rule's name.
    rule: &'static str,
    /// The node id's constructor.
    kind: fn(String) -> NodeId,
    /// The node id's key.
    key: &'static str,
    /// The file the finding is stated in.
    file: &'static str,
    /// The line the finding is stated at, when it has one.
    line: Option<usize>,
    /// The finding's display.
    display: &'static str,
    /// The finding's fix.
    fix: &'static str,
}

/// The findings of the fixture without its deltas.
const BASE_ROWS: &[FindingRow] = &[
    FindingRow {
        rule: "live-references",
        kind: NodeId::Item,
        key: "crates/delta/src/lib.rs::read",
        file: DELTA_LIB,
        line: Some(12),
        display: "crates/delta/src/lib.rs:12: Implements: tag names requirement:delta/reads-totals, which does not exist",
        fix: IMPLEMENTS_FIX,
    },
    FindingRow {
        rule: "live-references",
        kind: NodeId::Item,
        key: "crates/delta/src/lib.rs::clear",
        file: DELTA_LIB,
        line: Some(19),
        display: "crates/delta/src/lib.rs:19: Implements: tag names requirement:delta/clears-totals, which does not exist",
        fix: IMPLEMENTS_FIX,
    },
    FindingRow {
        rule: "live-references",
        kind: NodeId::Item,
        key: "crates/delta/src/lib.rs::sum",
        file: DELTA_LIB,
        line: Some(26),
        display: "crates/delta/src/lib.rs:26: Implements: tag names requirement:delta/sums-lists, which does not exist",
        fix: IMPLEMENTS_FIX,
    },
    FindingRow {
        rule: "live-references",
        kind: NodeId::Test,
        key: "crates/delta/tests/totals.rs::zero_plus_two",
        file: DELTA_TOTALS,
        line: Some(11),
        display: "crates/delta/tests/totals.rs:11: Covers: tag names scenario:delta/zero-plus-two, which does not exist",
        fix: COVERS_FIX,
    },
    FindingRow {
        rule: "live-references",
        kind: NodeId::Test,
        key: "crates/delta/tests/totals.rs::read_after_add",
        file: DELTA_TOTALS,
        line: Some(17),
        display: "crates/delta/tests/totals.rs:17: Covers: tag names scenario:delta/read-after-add, which does not exist",
        fix: COVERS_FIX,
    },
];

/// The one finding left once the `001-totals` delta counts as live.
const CHANGE_ROWS: &[FindingRow] = &[FindingRow {
    rule: "live-references",
    kind: NodeId::Item,
    key: "crates/delta/src/lib.rs::sum",
    file: DELTA_LIB,
    line: Some(26),
    display: "crates/delta/src/lib.rs:26: Implements: tag names requirement:delta/sums-lists, which does not exist",
    fix: IMPLEMENTS_FIX,
}];

/// Checks findings row by row, naming the first row that differs.
fn check_rows(actual: &[Finding], expected: &[&FindingRow]) {
    for (index, (got, row)) in actual.iter().zip(expected).enumerate() {
        let node = (row.kind)(row.key.to_owned());
        let location = Some(Location {
            file: row.file.to_owned(),
            line: row.line,
        });
        assert!(
            got.rule == row.rule
                && got.node == node
                && got.location == location
                && got.to_string() == row.display
                && got.fix == row.fix,
            "finding row {index} differs: expected rule {:?}, node {node:?}, location {location:?}, display {:?}, fix {:?}; got rule {:?}, node {:?}, location {:?}, display {:?}, fix {:?}",
            row.rule,
            row.display,
            row.fix,
            got.rule,
            got.node,
            got.location,
            got.to_string(),
            got.fix,
        );
    }
    assert_eq!(
        expected.len(),
        actual.len(),
        "findings have {} rows, expected {}",
        actual.len(),
        expected.len()
    );
}

/// Covers: rust-linter/findings-of-the-link-gates-change-fixture
#[test]
fn findings_of_the_link_gates_change_fixture() {
    let findings = fixture_findings();
    let expected: Vec<&FindingRow> = BASE_ROWS.iter().collect();
    check_rows(&findings, &expected);
}

/// Covers: rust-linter/link-gates-with-a-change
#[test]
fn link_gates_with_a_change() {
    let findings = change_findings("openspec/changes/001-totals");
    let expected: Vec<&FindingRow> = CHANGE_ROWS.iter().collect();
    check_rows(&findings, &expected);
}

/// Covers: rust-linter/link-gates-with-a-change-that-has-no-specs
#[test]
fn link_gates_with_a_change_that_has_no_specs() {
    let findings = change_findings("openspec/changes/002-missing");
    let expected: Vec<&FindingRow> = BASE_ROWS.iter().collect();
    check_rows(&findings, &expected);
}
