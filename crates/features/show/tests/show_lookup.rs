//! Proves the show command's arguments, lookup forms and lookup errors.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_show::ShowFeature;

/// The fixture project that every lookup test copies.
fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/show-project")
}

/// Creates a scratch copy of the fixture under a test's own name.
fn copy_fixture(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    copy_dir(&fixture(), &root);
    write(
        &root.join("openspec/changes/003-running/.run/running/1.pid"),
        "{\"pid\":4242,\"startedAt\":1759395600000}\n",
    );
    root
}

/// Creates an empty scratch root.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Copies a directory tree recursively.
fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("the destination folder is created");
    for entry in fs::read_dir(from)
        .expect("the source folder reads")
        .flatten()
    {
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type reads").is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("the file is copied");
        }
    }
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the parent folders are created");
    fs::write(path, text).expect("the file is written");
}

/// Runs show with literal arguments on a root.
fn run(root: &Path, args: &[&str]) -> Result<String, FeatureError> {
    ShowFeature
        .run(&Invocation::new(
            root,
            "show",
            args.iter().map(|arg| (*arg).to_owned()).collect(),
        ))
        .map(|output| output.text)
}

/// Proves the argument errors before any file is read.
///
/// Covers: rust-show/show-argument-errors
#[test]
fn show_argument_errors() {
    let root = scratch("show-argument-errors");
    let cases: [(&[&str], &str); 3] = [
        (&[], "usage of show: expected <id>"),
        (&["1", "2"], "usage of show: expected <id>"),
        (
            &["  "],
            "usage of show: specify a spec ID to show (e.g. osq show 001)",
        ),
    ];
    for (args, text) in cases {
        let error = run(&root, args).expect_err("the arguments are refused");
        assert_eq!(error.to_string(), text, "{args:?}");
        assert!(matches!(error, FeatureError::Usage { .. }), "{args:?}");
    }
}

/// Proves every lookup form finds the change whose golden shares its first line.
///
/// Covers: rust-show/show-lookup-forms
#[test]
fn show_lookup_forms() {
    let root = copy_fixture("show-lookup-forms");
    let cases = [
        ("1", include_str!("fixtures/golden/active-001.txt")),
        ("approved", include_str!("fixtures/golden/approved-002.txt")),
        ("003", include_str!("fixtures/golden/running-003.txt")),
        ("004-dead", include_str!("fixtures/golden/dead-004.txt")),
        ("5", include_str!("fixtures/golden/steering-005.txt")),
        ("006", include_str!("fixtures/golden/blocked-006.txt")),
        ("007", include_str!("fixtures/golden/unplanned-007.txt")),
        ("10", include_str!("fixtures/golden/archived-010.txt")),
        (
            "openspec/changes/archive/010-archived",
            include_str!("fixtures/golden/archived-010.txt"),
        ),
        ("011", include_str!("fixtures/golden/rejected-011.txt")),
    ];
    for (argument, golden) in cases {
        let output = run(&root, &[argument]).expect("the change is found");
        assert_eq!(output.lines().next(), golden.lines().next(), "{argument}");
    }
    let edge_cases = [
        ("0002", "0002", "0002"),
        ("02", "02-x", "02"),
        ("2", "002-x", "002"),
        ("alpha", "x-alpha", "x-alpha"),
        ("-2", "0-2-x", "0"),
    ];
    for (index, (argument, folder, id)) in edge_cases.iter().enumerate() {
        let edge = scratch(&format!("show-lookup-forms-edge-{index}"));
        write(
            &edge
                .join("openspec/changes")
                .join(folder)
                .join("proposal.md"),
            "---\ntitle: Edge\n---\n## Goal\n\nGoal.\n",
        );
        let output = run(&edge, &[argument]).expect("the edge form is found");
        assert_eq!(
            output.lines().next(),
            Some(format!("Spec: {folder} ({id})").as_str()),
            "{argument}"
        );
    }
}

/// Proves the failed lookup texts equal TypeScript's.
///
/// Covers: rust-show/show-errors-equal-typescript-s
#[test]
fn show_errors_equal_typescript() {
    let root = copy_fixture("show-errors-equal-typescript");
    let cases = [
        ("999", include_str!("fixtures/golden/unknown-999.err.txt")),
        (
            "012",
            include_str!("fixtures/golden/no-proposal-012.err.txt"),
        ),
    ];
    for (argument, golden) in cases {
        let expected = golden
            .trim_end_matches('\n')
            .strip_prefix("Show error: ")
            .expect("the golden names the show error")
            .replace("<root>", &root.display().to_string());
        let error = run(&root, &[argument]).expect_err("the lookup fails");
        match error {
            FeatureError::Failed { message, .. } => {
                assert_eq!(message, expected, "{argument}");
            }
            other => panic!("{argument}: expected a failed error, got {other:?}"),
        }
    }
}
