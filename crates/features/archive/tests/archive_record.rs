//! Proves the archive record, its put-back and its stopped-archive refusal.

mod support;

use std::fs;
use std::path::Path;

use osq_core::FeatureError;

use support::{fixture, run, scratch, tree};

/// The fixture change the tests archive.
const CHANGE: &str = "openspec/changes/007-sample";

/// The record file inside the fixture change.
const RECORD: &str = "openspec/changes/007-sample/.run/archive-specs.json";

/// How a row replaces one living path.
#[derive(Clone, Copy)]
enum Made {
    /// A file holding this text.
    File(&'static str),
    /// An empty folder.
    Folder,
}

/// One row of the living-file failure table.
struct Row {
    /// The row's label in assertion messages.
    label: &'static str,
    /// The living path the row replaces, relative to the root.
    path: &'static str,
    /// What the row puts at that path.
    made: Made,
    /// The path the error message names.
    message: &'static str,
}

/// The living-file failure table.
const ROWS: [Row; 2] = [
    Row {
        label: "gamma is a file",
        path: "openspec/specs/gamma",
        made: Made::File("x"),
        message: "openspec/specs/gamma/spec.md",
    },
    Row {
        label: "epsilon sidecar is a folder",
        path: "openspec/specs/epsilon/osq.yml",
        made: Made::Folder,
        message: "openspec/specs/epsilon/osq.yml",
    },
];

/// Proves a stopped archive's record refuses the change before anything writes.
///
/// Covers: rust-archive/record-left-by-a-stopped-archive
#[test]
fn record_left_by_a_stopped_archive() {
    let root = scratch("record-stopped");
    let record = root.join(RECORD);
    fs::write(&record, "{}").unwrap();

    let error = run(&root, &["007"]).expect_err("the record refuses the archive");
    assert_eq!(
        error.to_string(),
        "archive failed: 007-sample holds .run/archive-specs.json from a stopped archive"
    );
    assert_failed(&error);
    assert_eq!(fs::read_to_string(&record).unwrap(), "{}");
    assert_tree_except(&root, RECORD, "stopped record");
}

/// Proves each row names its path, keeps its replacement and puts the rest back.
///
/// Covers: rust-archive/living-file-that-cannot-be-written
#[test]
fn living_file_that_cannot_be_written() {
    for (index, row) in ROWS.iter().enumerate() {
        let root = scratch(&format!("record-living-{index}"));
        replace(&root, row);

        let error = run(&root, &["007"]).expect_err("the living write fails");
        let prefix = format!("archive failed: cannot write {}: ", row.message);
        assert!(
            error.to_string().starts_with(&prefix),
            "{}: {error}",
            row.label
        );
        assert_failed(&error);
        assert_made(&root, row);
        assert!(!root.join(CHANGE).join(".run/archive-specs.json").exists());
        assert_tree_except(&root, row.path, row.label);
        assert_restored(&root, row.label);
    }
}

/// Proves a record that cannot be written names it and leaves the tree alone.
///
/// Covers: rust-archive/record-that-cannot-be-written
#[test]
fn record_that_cannot_be_written() {
    let root = scratch("record-cannot-write");
    let record = root.join(CHANGE).join(".run/archive-specs.json");
    fs::create_dir_all(&record).unwrap();

    let error = run(&root, &["007"]).expect_err("the record cannot be written");
    let prefix = format!("archive failed: cannot write {RECORD}: ");
    assert!(error.to_string().starts_with(&prefix), "{error}");
    assert_failed(&error);
    assert!(record.is_dir(), "the empty folder stays");
    assert_eq!(fs::read_dir(&record).unwrap().count(), 0);
    assert_tree_except(&root, RECORD, "record cannot be written");
}

/// Asserts the error is the archive command's failure.
fn assert_failed(error: &FeatureError) {
    match error {
        FeatureError::Failed { command, .. } => assert_eq!(command, "archive"),
        other => panic!("expected a failed error, got {other:?}"),
    }
}

/// Replaces one row's living path with what the row makes.
fn replace(root: &Path, row: &Row) {
    let path = root.join(row.path);
    let parent = path.parent().unwrap();
    fs::create_dir_all(parent).unwrap();
    match row.made {
        Made::File(text) => fs::write(&path, text).unwrap(),
        Made::Folder => {
            let _ = fs::remove_file(&path);
            fs::create_dir_all(&path).unwrap();
        }
    }
}

/// Asserts one row's replaced path is still what the row made.
fn assert_made(root: &Path, row: &Row) {
    let path = root.join(row.path);
    match row.made {
        Made::File(text) => assert_eq!(fs::read_to_string(&path).unwrap(), text, "{}", row.label),
        Made::Folder => {
            assert!(path.is_dir(), "{} stays a folder", row.label);
            assert_eq!(
                fs::read_dir(&path).unwrap().count(),
                0,
                "{} stays empty",
                row.label
            );
        }
    }
}

/// Asserts the copy equals the fixture apart from one replaced path.
fn assert_tree_except(root: &Path, replaced: &str, label: &str) {
    let mut expected = tree(&fixture());
    let mut actual = tree(root);
    expected.remove(replaced);
    actual.remove(replaced);
    assert_eq!(actual, expected, "{label} writes nothing else");
}

/// Asserts the living files the failed write must put back.
fn assert_restored(root: &Path, label: &str) {
    for relative in [
        "openspec/specs/alpha/spec.md",
        "openspec/specs/alpha/osq.yml",
        "openspec/specs/beta/spec.md",
        "openspec/specs/beta/osq.yml",
    ] {
        assert_eq!(
            fs::read(root.join(relative)).unwrap(),
            fs::read(fixture().join(relative)).unwrap(),
            "{label}: {relative} is back"
        );
    }
    assert!(
        !root.join("openspec/specs/gamma/spec.md").exists(),
        "{label}: no gamma spec is left"
    );
}
