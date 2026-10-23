//! Proves the retry feature's command list and its argument errors.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_retry::RetryFeature;

/// Creates an empty scratch project root for one test.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("retry_feature")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Proves the one command's name, summary and usage.
///
/// Covers: rust-retry/retry-feature-commands
#[test]
fn retry_feature_commands() {
    let feature = RetryFeature;
    assert_eq!(feature.name(), "retry");
    let commands = feature.commands();
    assert_eq!(commands.len(), 1, "it lists one command");
    assert_eq!(commands[0].name, "retry", "the command name");
    assert_eq!(
        commands[0].summary, "clear a dead or regressed task or change so it runs again",
        "the command summary"
    );
    assert_eq!(commands[0].usage, "<id> <task|change>", "the command usage");
}

/// Proves the usage and unknown-command errors before any file is read.
///
/// Covers: rust-retry/retry-argument-errors
#[test]
fn retry_argument_errors() {
    let feature = RetryFeature;
    let root = scratch("retry_argument_errors");
    let rows: [(&str, &[&str], &str); 3] = [
        (
            "retry",
            &["1"],
            "usage of retry: expected a change id and a target, got 1",
        ),
        (
            "retry",
            &["1", "2", "3"],
            "usage of retry: expected a change id and a target, got 3",
        ),
        ("inbox", &[], "unknown command: inbox"),
    ];
    for (command, args, expected) in rows {
        let args = args.iter().map(|arg| (*arg).to_owned()).collect();
        let error = feature
            .run(&Invocation::new(&root, command, args))
            .expect_err("the invocation is refused");
        assert_eq!(error.to_string(), expected, "{command}");
    }
}
