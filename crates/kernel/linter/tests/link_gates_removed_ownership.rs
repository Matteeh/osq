//! Link gates over a change that removes a capability's Code ownership.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Finding, Location, NodeId};
use osq_kernel_linter::change_link_gates;

/// The fix for a file no capability owns.
const ADD_FIX: &str = "Add the file to one capability's Code ownership globs.";
/// The fix for a capability that owns no file.
const OWNERSHIP_FIX: &str =
    "Add a Code ownership requirement whose globs cover the capability's files.";

/// The copied link gates ownership fixture project.
fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/link-gates-ownership")
}

/// Runs `change_link_gates` over the fixture with the `tools` group.
fn change_findings(change: &str) -> Vec<Finding> {
    change_findings_at(&fixture_root(), change)
}

/// Runs `change_link_gates` over a project with the `tools` group.
fn change_findings_at(root: &Path, change: &str) -> Vec<Finding> {
    change_link_gates(
        root,
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

/// Builds one `complete-capabilities` finding row for a capability.
fn complete_capability(capability: &str, message: &str, fix: &str) -> FindingRow {
    let file = format!("openspec/specs/{capability}/spec.md");
    FindingRow {
        rule: "complete-capabilities",
        node: NodeId::Capability(capability.to_owned()),
        location: Some(Location {
            file: file.clone(),
            line: None,
        }),
        display: format!("{file}: {message}"),
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

/// Covers: rust-linter/a-change-removes-a-capability-s-ownership
#[test]
fn a_change_removes_a_capability_s_ownership() {
    check_rows(&change_findings("openspec/changes/003-retire"), &[]);
}

/// Covers: rust-linter/removed-ownership-with-no-new-owner
#[test]
fn removed_ownership_with_no_new_owner() {
    check_rows(
        &change_findings("openspec/changes/004-orphan"),
        &[
            owned_once("crates/fresh/src/lib.rs", "owned by no capability", ADD_FIX),
            owned_once("crates/keep/src/lib.rs", "owned by no capability", ADD_FIX),
            owned_once("crates/split/src/lib.rs", "owned by no capability", ADD_FIX),
        ],
    );
}

/// Covers: rust-linter/removed-ownership-with-no-new-owner
#[test]
fn an_emptied_capability_is_left_out_and_another_stays() {
    let root = fixture_with_decisions();
    check_rows(
        &change_findings_at(&root, "openspec/changes/004-orphan"),
        &[
            owned_once("crates/fresh/src/lib.rs", "owned by no capability", ADD_FIX),
            owned_once("crates/keep/src/lib.rs", "owned by no capability", ADD_FIX),
            owned_once("crates/split/src/lib.rs", "owned by no capability", ADD_FIX),
            complete_capability("stay", "stay owns no file", OWNERSHIP_FIX),
        ],
    );
}

/// Covers: rust-linter/removed-ownership-with-no-new-owner
#[test]
fn removed_ownership_stops_counting_living_globs() {
    let root = fixture_with_keep_notes();
    check_rows(
        &change_findings_at(&root, "openspec/changes/004-orphan"),
        &[
            owned_once("crates/fresh/src/lib.rs", "owned by no capability", ADD_FIX),
            owned_once("crates/keep/src/lib.rs", "owned by no capability", ADD_FIX),
            owned_once("crates/split/src/lib.rs", "owned by no capability", ADD_FIX),
        ],
    );
}

/// Covers: rust-linter/removed-ownership-with-no-new-owner
#[test]
fn another_removed_requirement_keeps_ownership() {
    let root = fixture_with_keep_notes();
    check_rows(
        &change_findings_at(&root, "openspec/changes/005-notes"),
        &[owned_once(
            "crates/fresh/src/lib.rs",
            "owned by no capability",
            ADD_FIX,
        )],
    );
}

/// A copy of the fixture with a decisions folder, an ADR and the `stay` capability.
fn fixture_with_decisions() -> PathBuf {
    let root = copy_fixture("link-gates-removed-ownership-emptied");
    let decisions = root.join("decisions");
    fs::create_dir_all(&decisions).expect("the decisions folder is created");
    fs::write(
        decisions.join("001-stay.md"),
        "---\nstatus: accepted\napplies_to: [keep]\nrule: Keep is governed during the change.\nchecks:\n  - crates/keep/src/lib.rs\n---\n# 001. Keep is governed\n",
    )
    .expect("the ADR is written");
    let stay = root.join("openspec/specs/stay");
    fs::create_dir_all(&stay).expect("the stay capability is created");
    fs::write(stay.join("osq.yml"), "group: tools\n").expect("the stay sidecar is written");
    fs::write(
        stay.join("spec.md"),
        "# stay Specification\n\n## Purpose\nStay, so the change leaves it alone.\n\n## Requirements\n\n### Requirement: Keeps notes\nThe system SHALL keep notes.\n",
    )
    .expect("the stay spec is written");
    root
}

/// A copy of the fixture whose `keep` spec has a second requirement.
fn fixture_with_keep_notes() -> PathBuf {
    let root = copy_fixture("link-gates-removed-ownership-keep-notes");
    let keep = root.join("openspec/specs/keep/spec.md");
    let mut spec = fs::read_to_string(&keep).expect("the keep spec reads");
    spec.push_str("\n### Requirement: Keeps notes\nThe system SHALL keep notes.\n");
    fs::write(&keep, spec).expect("the keep spec is written");
    let notes = root.join("openspec/changes/005-notes/specs/keep");
    fs::create_dir_all(&notes).expect("the notes change is created");
    fs::write(
        notes.join("spec.md"),
        "## REMOVED Requirements\n\n### Requirement: Keeps notes\n**Reason**: This change retires notes.\n**Migration**: None.\n",
    )
    .expect("the notes delta is written");
    root
}

/// A fresh scratch folder holding a copy of the fixture.
fn copy_fixture(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    copy_dir(&fixture_root(), &root);
    root
}

/// Copies a folder tree, creating every folder under `target`.
fn copy_dir(source: &Path, target: &Path) {
    fs::create_dir_all(target).expect("the target folder is created");
    for entry in fs::read_dir(source).expect("the source folder reads") {
        let entry = entry.expect("a source entry reads");
        let destination = target.join(entry.file_name());
        if entry.file_type().expect("the entry type reads").is_dir() {
            copy_dir(&entry.path(), &destination);
        } else {
            fs::copy(entry.path(), destination).expect("the fixture file is copied");
        }
    }
}
