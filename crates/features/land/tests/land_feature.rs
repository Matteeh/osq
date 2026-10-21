//! Proves the land feature's commands and its argument errors.

mod support;

use osq_core::{Command, Feature, FeatureError};
use osq_feature_land::LandFeature;

use support::{run_args, scratch};

/// Proves the feature's name and its one command.
///
/// Covers: rust-land/land-feature-commands
#[test]
fn land_feature_commands() {
    let feature = LandFeature;
    assert_eq!(feature.name(), "land");

    let commands = feature.commands();
    assert_eq!(commands.len(), 1, "one command");
    assert_eq!(
        commands[0],
        Command::new(
            "land",
            "land an archived change onto the default branch",
            "<id>"
        ),
        "the land command"
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
