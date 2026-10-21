//! Proves the refusals: a change that is not done and a delta that does not apply.

mod reseal;
mod support;

use std::fs;
use std::path::Path;

use osq_core::FeatureError;

use support::{fixture, run, scratch, tree};

/// The fixture change the tests edit and archive.
const CHANGE: &str = "openspec/changes/007-sample";

/// The refused delta whose MODIFIED requirement no living spec has.
const REFUSED_DELTA: &str = "## MODIFIED Requirements\n\n### Requirement: Gamma missing\n\
The system SHALL not exist.\n\n#### Scenario: Gamma missing runs\n\
- **WHEN** gamma missing runs\n- **THEN** it does not exist\n";

/// One row's edit of the fixture change.
type Edit = fn(&Path);

/// Proves each row of the not-done table writes nothing else.
///
/// Covers: rust-archive/change-that-is-not-done
#[test]
fn change_that_is_not_done() {
    let rows: [(&str, Edit, &str, &str); 5] = [
        ("done", remove_done, ".run/done/2", "007-sample is not done"),
        (
            "events",
            remove_events,
            ".run/events/2.jsonl",
            "007-sample is not done",
        ),
        (
            "approved",
            remove_approved,
            ".run/approved",
            "007-sample is not approved",
        ),
        (
            "marker",
            write_approved,
            ".run/approved",
            "007-sample is not approved",
        ),
        (
            "proposal",
            append_proposal,
            "proposal.md",
            "007-sample changed since it was approved",
        ),
    ];
    for (index, (name, edit, changed, message)) in rows.iter().enumerate() {
        let root = scratch(&format!("not-done-{index}"));
        edit(&root);
        let error = run(&root, &["007"]).expect_err("the change is refused");
        assert_eq!(
            error.to_string(),
            format!("archive failed: {message}"),
            "{name}"
        );
        match &error {
            FeatureError::Failed { command, .. } => assert_eq!(command, "archive", "{name}"),
            other => panic!("{name}: expected a failed error, got {other:?}"),
        }
        let changed = format!("{CHANGE}/{changed}");
        assert_same_except(&root, &[changed.as_str()], name);
    }
}

/// Proves a delta that does not apply refuses the archive and writes nothing.
///
/// Covers: rust-archive/delta-that-does-not-apply
#[test]
fn delta_that_does_not_apply() {
    let root = scratch("delta-refused");
    let change = root.join(CHANGE);
    fs::write(change.join("specs/gamma/spec.md"), REFUSED_DELTA).unwrap();
    reseal::reseal(&change);

    let error = run(&root, &["007"]).expect_err("the delta is refused");
    assert_eq!(
        error.to_string(),
        "archive failed: Cannot apply MODIFIED: requirement \"Gamma missing\" not found in base spec"
    );

    assert_same_except(
        &root,
        &[
            "openspec/changes/007-sample/specs/gamma/spec.md",
            "openspec/changes/007-sample/.run/approved",
        ],
        "delta refused",
    );
}

/// Removes the second task's done marker.
fn remove_done(root: &Path) {
    fs::remove_file(root.join(CHANGE).join(".run/done/2")).unwrap();
}

/// Removes the second task's event stream.
fn remove_events(root: &Path) {
    fs::remove_file(root.join(CHANGE).join(".run/events/2.jsonl")).unwrap();
}

/// Removes the approval marker.
fn remove_approved(root: &Path) {
    fs::remove_file(root.join(CHANGE).join(".run/approved")).unwrap();
}

/// Writes text that is not a seal to the approval marker.
fn write_approved(root: &Path) {
    fs::write(root.join(CHANGE).join(".run/approved"), "approved").unwrap();
}

/// Appends a line to the sealed proposal.
fn append_proposal(root: &Path) {
    let path = root.join(CHANGE).join("proposal.md");
    let mut text = fs::read_to_string(&path).unwrap();
    text.push_str("More.");
    fs::write(&path, text).unwrap();
}

/// Asserts the copy equals the fixture minus the paths a row changed.
fn assert_same_except(root: &Path, changed: &[&str], label: &str) {
    let mut expected = tree(&fixture());
    let mut actual = tree(root);
    for path in changed {
        expected.remove(*path);
        actual.remove(*path);
    }
    assert_eq!(actual, expected, "{label} writes nothing else");
}
