//! Proves the manual feature's command list and its argument errors.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Command, Feature, Invocation};
use osq_feature_manual::ManualFeature;

/// Creates an empty scratch project root for one test.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("manual_feature")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Proves the one command's name, summary and usage.
///
/// Covers: rust-manual/manual-feature-commands
#[test]
fn manual_feature_commands() {
    let feature = ManualFeature::new();
    assert_eq!(feature.name(), "manual");
    let commands = feature.commands();
    assert_eq!(commands.len(), 1, "it lists one command");
    assert_eq!(
        commands[0],
        Command::new(
            "manual",
            "keep uncommitted edits as a manual change with a comment",
            "<comment> [paths...]",
        ),
        "the manual command"
    );
}

/// Proves the usage and unknown-command errors before any file is read.
///
/// Covers: rust-manual/manual-argument-errors
#[test]
fn manual_argument_errors() {
    let feature = ManualFeature::new();
    let root = scratch("manual_argument_errors");
    let rows: [(&str, &[&str], &str); 2] = [
        (
            "manual",
            &[],
            "usage of manual: expected <comment> [paths...]",
        ),
        ("keep", &["x"], "unknown command: keep"),
    ];
    for (command, args, expected) in rows {
        let args = args.iter().map(|arg| (*arg).to_owned()).collect();
        let error = feature
            .run(&Invocation::new(&root, command, args))
            .expect_err("the invocation is refused");
        assert_eq!(error.to_string(), expected, "{command}");
        let entries = fs::read_dir(&root)
            .expect("the scratch root is read")
            .count();
        assert_eq!(entries, 0, "the root stays empty after {command}");
    }
}

/// Proves `at` fixes a clock that `new` leaves open.
///
/// Covers: rust-manual/manual-argument-errors
#[test]
fn at_fixes_the_clock() {
    assert_ne!(ManualFeature::at(5), ManualFeature::new());
}
