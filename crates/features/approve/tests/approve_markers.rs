//! Proves the approval marker and the output it prints.

mod support;

use std::collections::BTreeMap;
use std::path::Path;

use support::{
    OLD_SEAL, STARTED_EVENT, current_seal, marker_bytes, run, scratch, tree, valid_change, write,
    write_approved, write_marker,
};

/// Removes the approval marker from a file tree.
fn without_marker(mut files: BTreeMap<String, Vec<u8>>) -> BTreeMap<String, Vec<u8>> {
    files.remove(".run/approved");
    files
}

/// Writes the files one marker row names under a fresh change folder.
fn apply_row(name: &str, root: &Path) {
    match name {
        "none" => {}
        "with-run-files" => {
            write_approved(root, "001-a", OLD_SEAL);
            write_marker(root, "001-a", ".run/done/1", &[]);
            write_marker(root, "001-a", ".run/events/1.jsonl", &[]);
            write(
                root,
                "openspec/changes/001-a/.run/events/1.jsonl",
                STARTED_EVENT,
            );
        }
        "current-seal" => {
            let seal = current_seal(root, "001-a");
            write_approved(root, "001-a", &format!("{seal}\n"));
        }
        "other-files" => {
            write(root, "openspec/changes/001-a/plan-prompt.md", "# Prompt\n");
            write(root, "openspec/changes/001-a/notes/why.md", "Why.\n");
        }
        other => panic!("unknown marker row {other}"),
    }
}

/// Proves every row of "Approval markers".
///
/// Covers: rust-approve/approval-markers
#[test]
fn approval_markers() {
    for name in ["none", "with-run-files", "current-seal", "other-files"] {
        let root = scratch(&format!("markers-{name}"));
        valid_change(&root, "001-a");
        apply_row(name, &root);
        let before = without_marker(tree(&root, "openspec/changes/001-a"));
        let output = run(&root, "1").unwrap_or_else(|error| panic!("{name}: {error}"));
        let seal = current_seal(&root, "001-a");
        assert_eq!(
            output.text,
            format!("Approved 001 (001-a)\n  Hash: {seal}\n"),
            "{name}: output"
        );
        assert_eq!(
            marker_bytes(&root, "001-a"),
            Some(format!("{seal}\n").into_bytes()),
            "{name}: marker"
        );
        let after = without_marker(tree(&root, "openspec/changes/001-a"));
        assert_eq!(after, before, "{name}: other files");
    }
}

/// Proves the output for a folder whose name has no leading number.
///
/// Covers: rust-approve/output-for-a-folder-without-a-number
#[test]
fn output_for_a_folder_without_a_number() {
    let root = scratch("markers-without-a-number");
    valid_change(&root, "x-y");
    let output = run(&root, "x-y").expect("the change approves");
    let seal = current_seal(&root, "x-y");
    assert_eq!(
        output.text,
        format!("Approved x-y (x-y)\n  Hash: {seal}\n"),
        "output"
    );
    assert_eq!(
        marker_bytes(&root, "x-y"),
        Some(format!("{seal}\n").into_bytes()),
        "marker"
    );
}
