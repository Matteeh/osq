//! Proves the approve feature's commands and its argument errors.

mod support;

use osq_core::{Command, Feature, FeatureError};
use osq_feature_approve::ApproveFeature;

use support::{run_args, scratch};

/// Proves the feature's name and its commands.
///
/// Covers: rust-approve/approve-feature-commands
#[test]
fn approve_feature_commands() {
    let feature = ApproveFeature;
    assert_eq!(feature.name(), "approve");

    let commands = feature.commands();
    assert_eq!(commands.len(), 2, "two commands");
    assert_eq!(
        commands[0],
        Command::new(
            "approve",
            "lint, hash, and approve change folders",
            "<id> [--base-ok] [--ignore-dirty]"
        ),
        "the approve command"
    );
    assert_eq!(
        commands[1],
        Command::new(
            "reject",
            "move an eligible active change intact into rejected history",
            "<id> --reason <text>"
        ),
        "the reject command"
    );
}

/// Proves every row of "Approve argument errors".
///
/// Covers: rust-approve/approve-argument-errors
#[test]
fn approve_argument_errors() {
    let root = scratch("argument_errors");
    let cases: Vec<(&str, &str, Vec<&str>, &str)> = vec![
        (
            "no args",
            "approve",
            vec![],
            "usage of approve: expected one change id, got 0",
        ),
        (
            "two args",
            "approve",
            vec!["1", "2"],
            "usage of approve: expected one change id, got 2",
        ),
        (
            "unknown command",
            "queue",
            vec!["1"],
            "unknown command: queue",
        ),
        (
            "only flags",
            "approve",
            vec!["--base-ok", "--ignore-dirty"],
            "usage of approve: expected one change id, got 0",
        ),
        (
            "flags around two ids",
            "approve",
            vec!["1", "--base-ok", "2"],
            "usage of approve: expected one change id, got 2",
        ),
    ];
    for (name, command, args, expected) in cases {
        let result = run_args(&root, command, &args);
        let error = result.expect_err("the invocation fails");
        assert_eq!(error.to_string(), expected, "{name}");
        match &error {
            FeatureError::Usage { command, .. } => assert_eq!(command, "approve", "{name}"),
            FeatureError::UnknownCommand { .. } => {}
            other => panic!("{name}: expected a usage or unknown command error, got {other:?}"),
        }
    }
    let error = run_args(
        &root,
        "approve",
        &["--ignore-dirty", "9", "--base-ok", "--base-ok"],
    )
    .expect_err("an unknown change is refused");
    assert_eq!(
        error.to_string(),
        format!(
            "approve failed: Spec \"9\" not found in {}",
            root.join("openspec/changes").display()
        ),
        "flags leave one change id"
    );
    match error {
        FeatureError::Failed { command, .. } => assert_eq!(command, "approve", "failed command"),
        other => panic!("expected a failed error, got {other:?}"),
    }
}
