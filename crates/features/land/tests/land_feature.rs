//! Proves the land feature's commands and its argument errors.

mod support;

use std::fs;

use osq_core::{Command, Feature, FeatureError};
use osq_feature_land::LandFeature;

use support::{run_args, scratch};

/// Proves the feature's name and its three commands.
///
/// Covers: rust-land/land-feature-commands
#[test]
fn land_feature_commands() {
    let feature = LandFeature;
    assert_eq!(feature.name(), "land");

    let commands = feature.commands();
    assert_eq!(commands.len(), 3, "three commands");
    assert_eq!(
        commands,
        vec![
            Command::new(
                "land",
                "land an archived change onto the default branch",
                "<id>"
            ),
            Command::new(
                "sync",
                "merge the default branch into a change's branch",
                "<id>"
            ),
            Command::new(
                "message",
                "print an archived change's land commit message",
                "<id>"
            ),
        ]
    );
}

/// Proves every row of "Land argument errors".
///
/// Covers: rust-land/land-argument-errors
#[test]
fn land_argument_errors() {
    let root = scratch("argument_errors");
    let cases: Vec<(&str, &str, Vec<&str>, &str)> = vec![
        (
            "no args",
            "land",
            vec![],
            "usage of land: expected one change id, got 0",
        ),
        (
            "two args",
            "land",
            vec!["1", "2"],
            "usage of land: expected one change id, got 2",
        ),
        (
            "unknown command",
            "archive",
            vec!["1"],
            "unknown command: archive",
        ),
    ];
    for (name, command, args, expected) in cases {
        let result = run_args(&root, command, &args);
        let error = result.expect_err("the invocation fails");
        assert_eq!(error.to_string(), expected, "{name}");
        match &error {
            FeatureError::Usage { command, .. } => assert_eq!(command, "land", "{name}"),
            FeatureError::UnknownCommand { .. } => {}
            other => panic!("{name}: expected a usage or unknown command error, got {other:?}"),
        }
    }
}

/// Proves every row of "Sync and message argument errors".
///
/// Covers: rust-land/sync-and-message-argument-errors
#[test]
fn sync_and_message_argument_errors() {
    let root = scratch("sync_message_argument_errors");
    let cases: [(&str, &str, &[&str], &str); 4] = [
        (
            "sync no args",
            "sync",
            &[],
            "usage of sync: expected one change id, got 0",
        ),
        (
            "sync two args",
            "sync",
            &["1", "2"],
            "usage of sync: expected one change id, got 2",
        ),
        (
            "message no args",
            "message",
            &[],
            "usage of message: expected one change id, got 0",
        ),
        (
            "message two args",
            "message",
            &["1", "2"],
            "usage of message: expected one change id, got 2",
        ),
    ];
    for (name, command, args, expected) in cases {
        let result = run_args(&root, command, args);
        let error = result.expect_err("the invocation fails");
        assert_eq!(error.to_string(), expected, "{name}");
        match &error {
            FeatureError::Usage { command: named, .. } => assert_eq!(named, command, "{name}"),
            other => panic!("{name}: expected a usage error, got {other:?}"),
        }
        assert_eq!(
            fs::read_dir(&root).expect("the root reads").count(),
            0,
            "{name}: the root still holds no files"
        );
    }
}
