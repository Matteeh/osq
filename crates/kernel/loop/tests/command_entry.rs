//! Proves the loop's one command entry point and the changes it delivers to.

mod delivery_support;

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use delivery_support::{
    Call, TestFeature, active_change, archived_change, rejected, scratch, write_events,
};
use osq_core::{EventKind, Feature, FeatureError, Invocation, Output};
use osq_kernel_loop::run_command;

/// A `seen` feature that lists `noop` and records each `rejected` event.
fn seen() -> TestFeature {
    TestFeature::new("seen")
        .command("noop", "writes nothing", "")
        .result("noop", Ok(Output::text("")))
        .kinds(&[EventKind::Rejected])
}

/// The change names a feature was called for, in order.
fn reacted_changes(calls: &[Call]) -> Vec<String> {
    calls
        .iter()
        .filter_map(|call| match call {
            Call::React { change, .. } => Some(change.clone()),
            Call::Run(_) => None,
        })
        .collect()
}

/// Runs git in `root` with a fixed test identity, failing when it fails.
fn git(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .current_dir(root)
        .args(args)
        .env("GIT_AUTHOR_NAME", "Test")
        .env("GIT_AUTHOR_EMAIL", "test@example.com")
        .env("GIT_COMMITTER_NAME", "Test")
        .env("GIT_COMMITTER_EMAIL", "test@example.com")
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

/// Writes an active `001-a`, an active `002-b` and an archived `000-z`, each
/// with one `rejected` line.
fn three_changes(root: &Path) {
    let first = active_change(root, "001-a");
    let second = active_change(root, "002-b");
    let archived = archived_change(root, "000-z");
    write_events(&first, "change.jsonl", &[rejected("first")]);
    write_events(&second, "change.jsonl", &[rejected("second")]);
    write_events(&archived, "change.jsonl", &[rejected("archived")]);
}

/// Proves every row of the entry point's command table.
///
/// Covers: rust-loop/commands-through-the-entry-point
#[test]
fn commands_through_the_entry_point() {
    let cases: [(&str, Result<Output, FeatureError>, Vec<Call>); 3] = [
        (
            "make",
            Ok(Output::text("made")),
            vec![Call::Run("make".to_owned())],
        ),
        (
            "fail",
            Err(FeatureError::failed("fail", "no")),
            vec![Call::Run("fail".to_owned())],
        ),
        (
            "nope",
            Err(FeatureError::unknown_command("nope")),
            Vec::new(),
        ),
    ];
    for (command, expected, called) in cases {
        let root = scratch(
            "command_entry",
            &format!("commands-through-the-entry-point-{command}"),
        );
        let make = TestFeature::new("make")
            .command("make", "does make", "")
            .result("make", Ok(Output::text("made")))
            .command("fail", "fails", "")
            .result("fail", Err(FeatureError::failed("fail", "no")));
        let other = TestFeature::new("other")
            .command("make", "also does make", "")
            .result("make", Ok(Output::text("other")));
        let make_calls = make.calls.clone();
        let other_calls = other.calls.clone();
        let features: Vec<Box<dyn Feature>> = vec![Box::new(make), Box::new(other)];

        let run = run_command(&features, &Invocation::new(&root, command, Vec::new()));

        assert_eq!(run.result, expected, "{command}");
        assert_eq!(run.failures.len(), 0, "{command}");
        assert_eq!(run.warnings.len(), 0, "{command}");
        assert_eq!(
            *make_calls.lock().expect("the call log is readable"),
            called,
            "{command}"
        );
        assert_eq!(
            other_calls.lock().expect("the call log is readable").len(),
            0,
            "{command}"
        );
    }
}

/// Proves the entry point visits active changes in listing order, never
/// archived ones, and reads nothing when no feature reacts.
///
/// Covers: rust-loop/changes-delivered-to
#[test]
fn changes_delivered_to() {
    let root = scratch("command_entry", "changes-delivered-to-with-react");
    three_changes(&root);
    let noop = TestFeature::new("noop")
        .command("noop", "writes nothing", "")
        .result("noop", Ok(Output::text("")));
    let seen = seen();
    let seen_calls = seen.calls.clone();
    let features: Vec<Box<dyn Feature>> = vec![Box::new(noop), Box::new(seen)];

    let run = run_command(&features, &Invocation::new(&root, "noop", Vec::new()));

    assert_eq!(run.result, Ok(Output::text("")));
    assert_eq!(run.failures.len(), 0);
    assert_eq!(run.warnings.len(), 0);
    let changes = reacted_changes(&seen_calls.lock().expect("the call log is readable"));
    assert_eq!(changes, ["001-a", "002-b"]);

    let quiet = scratch("command_entry", "changes-delivered-to-without-react");
    three_changes(&quiet);
    let noop = TestFeature::new("noop")
        .command("noop", "writes nothing", "")
        .result("noop", Ok(Output::text("")));
    let features: Vec<Box<dyn Feature>> = vec![Box::new(noop)];
    let run = run_command(&features, &Invocation::new(&quiet, "noop", Vec::new()));

    assert_eq!(run.failures.len(), 0);
    assert_eq!(run.warnings.len(), 0);
    for folder in ["001-a", "002-b"] {
        let delivered = quiet
            .join("openspec")
            .join("changes")
            .join(folder)
            .join(".run")
            .join("delivered");
        assert!(!delivered.exists(), "{folder} has no delivered folder");
    }
}

/// Builds a git project with an active root change and an active worktree change.
fn git_worktree_project(test: &str, row: &str, enabled: bool) -> (PathBuf, PathBuf) {
    let base = scratch(test, row);
    let root = base.join("project");
    fs::create_dir_all(&root).expect("the project root is created");
    fs::write(
        root.join("osq.toml"),
        format!("[vcs]\nenabled = {enabled}\nauthor = \"Test <test@example.com>\"\n"),
    )
    .expect("the config is written");
    fs::write(root.join("base.txt"), "base\n").expect("the base file is written");
    git(&root, &["init", "-q"]);
    git(&root, &["add", "base.txt"]);
    git(&root, &["commit", "-q", "-m", "base"]);

    let first = active_change(&root, "001-a");
    write_events(&first, "change.jsonl", &[rejected("first")]);
    let worktree = base.join("worktree");
    git(
        &root,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "osq/002-b",
            worktree.to_str().expect("the worktree path is UTF-8"),
        ],
    );
    let second = worktree.join("openspec").join("changes").join("002-b");
    fs::create_dir_all(second.join(".run")).expect("the worktree change is created");
    fs::write(second.join(".run").join("approved"), "").expect("the change is approved");
    write_events(&second, "change.jsonl", &[rejected("second")]);
    (root, second)
}

/// Proves a git worktree's active change is delivered alongside the root's.
///
/// Covers: rust-loop/changes-delivered-to
#[test]
fn worktree_changes_delivered() {
    let (root, _second) = git_worktree_project("command_entry", "worktree-changes-delivered", true);
    let feature = seen();
    let calls = feature.calls.clone();
    let features: Vec<Box<dyn Feature>> = vec![Box::new(feature)];
    let run = run_command(&features, &Invocation::new(&root, "noop", Vec::new()));

    assert_eq!(run.result, Ok(Output::text("")));
    assert_eq!(run.failures.len(), 0);
    assert_eq!(
        reacted_changes(&calls.lock().expect("the call log is readable")),
        ["001-a", "002-b"]
    );
}

/// Proves a worktree change is ignored when git is off.
///
/// Covers: rust-loop/changes-delivered-to
#[test]
fn worktree_changes_ignored_without_vcs() {
    let (root, _second) = git_worktree_project("command_entry", "worktree-changes-ignored", false);
    let feature = seen();
    let calls = feature.calls.clone();
    let features: Vec<Box<dyn Feature>> = vec![Box::new(feature)];
    let run = run_command(&features, &Invocation::new(&root, "noop", Vec::new()));

    assert_eq!(run.result, Ok(Output::text("")));
    assert_eq!(run.failures.len(), 0);
    assert_eq!(
        reacted_changes(&calls.lock().expect("the call log is readable")),
        ["001-a"]
    );
}
