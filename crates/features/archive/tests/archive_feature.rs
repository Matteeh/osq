//! Proves the archive feature's commands, argument errors and change lookup.

mod support;

use std::path::Path;

use osq_core::{Command, Feature, FeatureError, Invocation};
use osq_feature_archive::ArchiveFeature;

use support::{fixture, run, scratch, tree};

/// Proves the feature's name and its one command.
///
/// Covers: rust-archive/archive-feature-commands
#[test]
fn archive_feature_commands() {
    let feature = ArchiveFeature;
    assert_eq!(feature.name(), "archive");
    assert_eq!(
        feature.commands(),
        vec![Command::new(
            "archive",
            "apply a done change's deltas to the living specs and move it to the archive",
            "<change>",
        )]
    );
}

/// Proves each row of the argument errors table writes nothing.
///
/// Covers: rust-archive/archive-argument-errors
#[test]
fn archive_argument_errors() {
    let rows: [(&[&str], &str); 2] = [
        (
            &[],
            "usage of archive: expected one change, got 0 arguments",
        ),
        (
            &["007", "008"],
            "usage of archive: expected one change, got 2 arguments",
        ),
    ];
    for (index, (args, expected)) in rows.iter().enumerate() {
        let root = scratch(&format!("argument-errors-{index}"));
        let error = run(&root, args).expect_err("the arguments are refused");
        match &error {
            FeatureError::Usage { command, .. } => {
                assert_eq!(command, "archive", "row {index}");
            }
            other => panic!("row {index}: expected a usage error, got {other:?}"),
        }
        assert_eq!(error.to_string(), *expected, "row {index}");
        assert_eq!(tree(&root), tree(&fixture()), "row {index} writes nothing");
    }

    let root = scratch("argument-errors-command");
    let invocation = Invocation::new(&root, "land", vec!["007".to_owned()]);
    let error = ArchiveFeature
        .run(&invocation)
        .expect_err("land is not an archive command");
    assert_eq!(error.to_string(), "unknown command: land");
    assert_eq!(tree(&root), tree(&fixture()), "land writes nothing");
}

/// Proves the argument names a change by id or by folder.
///
/// Covers: rust-archive/change-named-by-id-or-folder
#[test]
fn change_named_by_id_or_folder() {
    for (index, argument) in ["007", "007-sample"].iter().enumerate() {
        let root = scratch(&format!("named-output-{index}"));
        run(&root, &[argument]).expect("the change archives");
        assert!(
            !tree(&root).contains_key("openspec/specs/beta"),
            "{argument} empties beta"
        );
    }
    let rows = [
        ("008", "no active change 008"),
        ("007-other", "no active change 007-other"),
    ];
    for (index, (argument, message)) in rows.iter().enumerate() {
        let root = scratch(&format!("named-refused-{index}"));
        let error = run(&root, &[argument]).expect_err("no change has that name");
        assert_eq!(error.to_string(), format!("archive failed: {message}"));
        same_as_fixture(&root, &format!("named-row-{index}"));
    }
}

/// Asserts a refused run left the fixture's files and folders untouched.
fn same_as_fixture(root: &Path, label: &str) {
    assert_eq!(tree(root), tree(&fixture()), "{label} writes nothing");
}
