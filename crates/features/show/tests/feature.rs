//! Proves the show feature's name, command and refusal.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Command, Feature, FeatureError, Invocation};
use osq_feature_show::ShowFeature;

/// Creates an empty scratch project root for one test.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Proves the feature's name, its three commands and its refusal of another command.
///
/// Covers: rust-show/show-feature-commands
#[test]
fn show_feature_commands() {
    let feature = ShowFeature;
    assert_eq!(feature.name(), "show");
    assert_eq!(
        feature.commands(),
        [
            Command::new(
                "show",
                "show detailed change information, tasks, and event timeline",
                "[--json] <id>",
            ),
            Command::new(
                "spec",
                "list living capabilities and their requirements, or print one requirement",
                "[capability] [requirement]",
            ),
            Command::new(
                "status",
                "show status overview of change folders and tasks",
                "",
            ),
        ]
    );
    let root = scratch("show-feature-commands");
    let error = feature
        .run(&Invocation::new(&root, "inbox", Vec::new()))
        .expect_err("the feature refuses another command");
    assert_eq!(error.to_string(), "unknown command: inbox");
    assert!(matches!(error, FeatureError::UnknownCommand { .. }));
}
