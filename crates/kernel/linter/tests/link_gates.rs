//! Link gate tests over the link gates fixture and a temporary project.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Finding, Location, NodeId};
use osq_kernel_linter::{GraphError, ScanError, link_gates};

/// The alpha library's path.
const ALPHA_LIB: &str = "crates/alpha/src/lib.rs";
/// The alpha test file's path.
const ADDING: &str = "crates/alpha/tests/adding.rs";
/// The beta library's path.
const BETA_LIB: &str = "crates/beta/src/lib.rs";

/// The fix for a file that two capabilities own.
const KEEP_FIX: &str = "Keep the file in one capability's Code ownership globs.";
/// The fix for a file that no capability owns.
const ADD_FIX: &str = "Add the file to one capability's Code ownership globs.";
/// The fix for a capability with no Purpose.
const PURPOSE_FIX: &str = "Write a Purpose section in the capability's spec.md.";
/// The fix for a capability with no requirement.
const REQUIREMENT_FIX: &str = "Add a requirement to the capability's spec.md.";
/// The fix for a capability that owns no file.
const OWNERSHIP_FIX: &str =
    "Add a Code ownership requirement whose globs cover the capability's files.";
/// The fix for a broken `applies_to` edge.
const APPLIES_FIX: &str = "Name a living capability, or a group as group:<name>.";
/// The fix for a reference to a non-accepted ADR.
const ADR_FIX: &str = "Name an accepted ADR.";
/// The fix for a broken `Implements:` tag.
const IMPLEMENTS_FIX: &str =
    "Name a living requirement as <capability>/<requirement name in kebab-case>.";
/// The fix for a broken `Covers:` tag.
const COVERS_FIX: &str = "Name a living scenario as <capability>/<scenario name in kebab-case>.";
/// The fix for an untagged public function.
const TAGGED_FIX: &str =
    "End its doc with Implements: <capability>/<requirement name in kebab-case>.";

/// The copied link gates fixture project.
fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/link-gates")
}

/// Runs the gates over the fixture with one group.
fn fixture_findings(group: &str) -> Vec<Finding> {
    link_gates(
        &fixture_root(),
        Path::new("decisions"),
        Path::new("openspec"),
        group,
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

/// The findings of the fixture with the `tools` group, in order.
const FIRST_ROWS: &[FindingRow] = &[
    FindingRow {
        rule: "owned-once",
        kind: NodeId::File,
        key: "crates/alpha/src/shared.rs",
        file: "crates/alpha/src/shared.rs",
        line: None,
        display: "crates/alpha/src/shared.rs: owned by alpha, beta",
        fix: KEEP_FIX,
    },
    FindingRow {
        rule: "owned-once",
        kind: NodeId::File,
        key: BETA_LIB,
        file: BETA_LIB,
        line: None,
        display: "crates/beta/src/lib.rs: owned by no capability",
        fix: ADD_FIX,
    },
    FindingRow {
        rule: "complete-capabilities",
        kind: NodeId::Capability,
        key: "beta",
        file: "openspec/specs/beta/spec.md",
        line: None,
        display: "openspec/specs/beta/spec.md: beta has no Purpose",
        fix: PURPOSE_FIX,
    },
    FindingRow {
        rule: "complete-capabilities",
        kind: NodeId::Capability,
        key: "gamma",
        file: "openspec/specs/gamma/spec.md",
        line: None,
        display: "openspec/specs/gamma/spec.md: gamma has no requirement",
        fix: REQUIREMENT_FIX,
    },
    FindingRow {
        rule: "complete-capabilities",
        kind: NodeId::Capability,
        key: "gamma",
        file: "openspec/specs/gamma/spec.md",
        line: None,
        display: "openspec/specs/gamma/spec.md: gamma owns no file",
        fix: OWNERSHIP_FIX,
    },
    FindingRow {
        rule: "live-references",
        kind: NodeId::Adr,
        key: "001",
        file: "decisions/001-tools.md",
        line: None,
        display: "decisions/001-tools.md: applies_to names capability:ghost, which does not exist",
        fix: APPLIES_FIX,
    },
    FindingRow {
        rule: "live-references",
        kind: NodeId::Adr,
        key: "002",
        file: "decisions/002-old.md",
        line: None,
        display: "decisions/002-old.md: superseded_by names adr:003, which is proposed",
        fix: ADR_FIX,
    },
    FindingRow {
        rule: "live-references",
        kind: NodeId::Item,
        key: "crates/alpha/src/lib.rs::add",
        file: ALPHA_LIB,
        line: Some(8),
        display: "crates/alpha/src/lib.rs:8: Adr: tag names adr:002, which is superseded",
        fix: ADR_FIX,
    },
    FindingRow {
        rule: "live-references",
        kind: NodeId::Item,
        key: "crates/alpha/src/lib.rs::Total::value",
        file: ALPHA_LIB,
        line: Some(24),
        display: "crates/alpha/src/lib.rs:24: Implements: tag names requirement:alpha/reads-totals, which does not exist",
        fix: IMPLEMENTS_FIX,
    },
    FindingRow {
        rule: "live-references",
        kind: NodeId::Test,
        key: "crates/alpha/tests/adding.rs::two_plus_two_by_title",
        file: ADDING,
        line: Some(13),
        display: "crates/alpha/tests/adding.rs:13: Covers: tag names scenario:alpha/Two plus two, which does not exist",
        fix: COVERS_FIX,
    },
    FindingRow {
        rule: "live-references",
        kind: NodeId::Item,
        key: "crates/beta/src/lib.rs::format",
        file: BETA_LIB,
        line: Some(6),
        display: "crates/beta/src/lib.rs:6: Adr: tag names adr:9, which does not exist",
        fix: ADR_FIX,
    },
    FindingRow {
        rule: "tagged-functions",
        kind: NodeId::Item,
        key: "crates/alpha/src/lib.rs::Total::reset",
        file: ALPHA_LIB,
        line: Some(30),
        display: "crates/alpha/src/lib.rs:30: public function Total::reset has no Implements: tag",
        fix: TAGGED_FIX,
    },
    FindingRow {
        rule: "tagged-functions",
        kind: NodeId::Item,
        key: "crates/alpha/src/lib.rs::subtract",
        file: ALPHA_LIB,
        line: Some(14),
        display: "crates/alpha/src/lib.rs:14: public function subtract has no Implements: tag",
        fix: TAGGED_FIX,
    },
];

/// The one `complete-capabilities` finding of the fixture with the `other` group.
const OTHER_ROWS: &[FindingRow] = &[FindingRow {
    rule: "complete-capabilities",
    kind: NodeId::Capability,
    key: "notes",
    file: "openspec/specs/notes/spec.md",
    line: None,
    display: "openspec/specs/notes/spec.md: notes owns no file",
    fix: OWNERSHIP_FIX,
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

/// Covers: rust-linter/findings-of-the-link-gates-fixture
#[test]
fn findings_of_the_link_gates_fixture() {
    let findings = fixture_findings("tools");
    let expected: Vec<&FindingRow> = FIRST_ROWS.iter().collect();
    check_rows(&findings, &expected);
}

/// Covers: rust-linter/link-gates-in-another-group
#[test]
fn link_gates_in_another_group() {
    let findings = fixture_findings("other");
    let complete: Vec<&Finding> = findings
        .iter()
        .filter(|finding| finding.rule == "complete-capabilities")
        .collect();
    let expected: Vec<&FindingRow> = OTHER_ROWS.iter().collect();
    check_rows(
        &complete.into_iter().cloned().collect::<Vec<Finding>>(),
        &expected,
    );
    let others: Vec<Finding> = findings
        .into_iter()
        .filter(|finding| finding.rule != "complete-capabilities")
        .collect();
    let expected: Vec<&FindingRow> = FIRST_ROWS
        .iter()
        .filter(|row| row.rule != "complete-capabilities")
        .collect();
    check_rows(&others, &expected);
}

/// Creates a fresh scratch project folder.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch folder is created");
    root
}

/// Covers: rust-linter/link-gate-errors
#[test]
fn link_gate_errors() {
    let root = scratch("link-gates-no-workspace");
    let manifest = root.join("Cargo.toml");
    fs::write(&manifest, "[package]\nname = \"one\"\n").expect("the manifest is written");
    match link_gates(
        &root,
        Path::new("decisions"),
        Path::new("openspec"),
        "tools",
    ) {
        Err(GraphError::Scan(ScanError::Manifest { path, .. })) => assert_eq!(manifest, path),
        other => panic!("expected a manifest error, got {other:?}"),
    }
}
