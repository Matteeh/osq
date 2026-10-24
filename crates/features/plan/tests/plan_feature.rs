//! Proves the plan feature's commands and its argument errors.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Command, Feature, Invocation};
use osq_feature_plan::PlanFeature;

/// Creates an empty scratch root for one test, removing any left-over folder.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Builds an invocation with literal arguments.
fn invocation(root: &Path, command: &str, args: &[&str]) -> Invocation {
    Invocation::new(
        root,
        command,
        args.iter().map(|arg| (*arg).to_owned()).collect(),
    )
}

/// Proves the feature's name and its two commands.
///
/// Covers: rust-plan/plan-feature-commands
#[test]
fn plan_feature_commands() {
    let feature = PlanFeature::new();
    assert_eq!(feature.name(), "plan");

    let commands = feature.commands();
    assert_eq!(commands.len(), 2, "two commands");
    assert_eq!(
        commands[0],
        Command::new("queue", "print the read-only brief queue projection", "",),
        "the queue command"
    );
    assert_eq!(
        commands[1],
        Command::new(
            "plan",
            "prepare a change and hand off its opening prompt to your planning tool",
            "--next [--replan] [--print] | <id> [--print] | <name> --brief <file> [--print]",
        ),
        "the plan command"
    );
}

/// Proves every row of "Queue argument errors".
///
/// Covers: rust-plan/queue-argument-errors
#[test]
fn queue_argument_errors() {
    let root = scratch("queue_argument_errors");
    let cases: [(&str, &[&str], &str); 3] = [
        (
            "queue",
            &["x"],
            "usage of queue: expected no arguments, got 1",
        ),
        (
            "queue",
            &["x", "y"],
            "usage of queue: expected no arguments, got 2",
        ),
        ("planx", &[], "unknown command: planx"),
    ];
    for (command, args, expected) in cases {
        let result = PlanFeature::new().run(&invocation(&root, command, args));
        assert_eq!(
            result.expect_err("the invocation fails").to_string(),
            expected,
            "command {command} with args {args:?}"
        );
    }
}
