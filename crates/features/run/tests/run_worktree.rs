//! Proves a verified task in an osq worktree is committed as TypeScript does.

mod support;
mod worktree_support;

use osq_core::FeatureError;

use support::{FOLDER, TASK};
use worktree_support::Repo;

/// The clock the direct message tests read.
mod time {
    /// A fixed time so elapsed seconds are exact.
    pub(crate) fn now_ms() -> i64 {
        1_000_000
    }
}

#[allow(dead_code)]
#[path = "../src/feature/message.rs"]
mod message;

/// The change folder's path in the worktree.
const CHANGE: &str = "openspec/changes/001-a";

/// Proves "Verified task commit".
///
/// Covers: rust-run/verified-task-commit
#[test]
fn verified_task_commit() {
    let repo = worktree_support::build("verified-commit");
    worktree_support::mode(&repo, "done");
    let before = worktree_support::tip(&repo.checkout, "osq/001-a");
    let output = worktree_support::run(&repo, &[FOLDER, TASK]).expect("the run succeeds");
    assert_eq!(output.text, "Task 1 of 001-a done\n", "the ending");

    let tip = worktree_support::tip(&repo.checkout, "osq/001-a");
    assert_ne!(tip, before, "the run made a commit");
    let started = worktree_support::last_started(&repo);
    let model = started.model.expect("the started event names a model");
    let version = started
        .osq_version
        .expect("the started event names a version");
    let message = worktree_support::message(&repo.worktree, &tip);
    let prefix = "osq: 001 task 1 verified\n\nWhen run, it works\n[ok] task 1 verified (elapsed: ";
    let rest = message.strip_prefix(prefix).expect("the message's start");
    let (_, rest) = rest.split_once("s)\n\n").expect("the outcome line");
    assert_eq!(
        rest,
        format!("Osq-Change: 001-a\nOsq-Task: 1\nOsq-Model: pi {model}\nOsq-Version: {version}\n"),
        "the trailers"
    );

    let mut actual: Vec<String> = worktree_support::name_status(&repo.worktree, &tip)
        .lines()
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect();
    actual.sort();
    let mut expected = vec![
        format!("A\t{CHANGE}/.run/done/1"),
        format!("A\t{CHANGE}/.run/events/1.jsonl"),
        format!("A\t{CHANGE}/.run/results/1.md"),
        format!("M\t{CHANGE}/tasks.md"),
        "A\tsrc/a.txt".to_owned(),
    ];
    expected.sort();
    assert_eq!(actual, expected, "the commit's paths");
}

/// Proves "Verified task commit fails".
///
/// Covers: rust-run/verified-task-commit-fails
#[test]
fn verified_task_commit_fails() {
    let repo = worktree_support::build("refused-commit");
    worktree_support::mode(&repo, "done");
    worktree_support::refuse_commits(&repo);
    let before = worktree_support::tip(&repo.checkout, "osq/001-a");
    let error = worktree_support::run(&repo, &[FOLDER, TASK]).expect_err("the commit is refused");
    match &error {
        FeatureError::Failed { command, .. } => assert_eq!(command, "run", "the command"),
        other => panic!("expected a failed run, got {other:?}"),
    }
    let text = error.to_string();
    let prefix = "run failed: task 1 of 001-a is done, but osq could not commit it: ";
    assert!(
        text.starts_with(prefix),
        "the failure starts with {prefix:?}: {text}"
    );
    assert!(text.contains("refused by hook"), "git's output: {text}");
    assert!(
        repo.worktree.join(CHANGE).join(".run/done/1").is_file(),
        "the done marker stays"
    );
    assert_eq!(
        worktree_support::tip(&repo.checkout, "osq/001-a"),
        before,
        "the tip is still the approval commit"
    );
}

/// Proves "Trailers from the last started event".
///
/// Covers: rust-run/trailers-from-the-last-started-event
#[test]
fn trailers_from_the_last_started_event() {
    let repo = worktree_support::build("last-started");
    worktree_support::mode(&repo, "done");
    support::write(
        &repo.worktree,
        &format!("{CHANGE}/.run/events/1.jsonl"),
        "not json\n{\"type\":\"started\",\"timestamp\":\"2020-01-01T00:00:00.000Z\",\"data\":{\"harness\":\"old\",\"model\":\"m0\",\"osqVersion\":\"0.0.1\"}}\n",
    );
    worktree_support::run(&repo, &[FOLDER, TASK]).expect("the run succeeds");
    let tip = worktree_support::tip(&repo.checkout, "osq/001-a");
    let started = worktree_support::last_started(&repo);
    let model = started.model.expect("the started event names a model");
    let version = started
        .osq_version
        .expect("the started event names a version");
    let message = worktree_support::message(&repo.worktree, &tip);
    assert!(
        message.ends_with(&format!("Osq-Model: pi {model}\nOsq-Version: {version}\n")),
        "the run's own trailers: {message}"
    );
    assert!(!message.contains("old m0"), "not the old model: {message}");
    assert!(!message.contains("0.0.1"), "not the old version: {message}");
    assert!(
        elapsed_seconds(&message) < 60,
        "the elapsed seconds are recent: {message}"
    );
}

/// Proves an untracked test file outside the scope is still committed.
///
/// Covers: rust-run/verified-task-commit
#[test]
fn an_untracked_test_file_is_committed() {
    let repo = worktree_support::build("untracked-test");
    let task = format!("{CHANGE}/tasks/1.md");
    let narrowed = support::read_text(&repo.worktree, &task).replace("  - src/**", "  - src/a.txt");
    support::write(&repo.worktree, &task, narrowed);
    support::write_seal(&repo.worktree);
    worktree_support::git(&repo.worktree, &["add", "-A"]);
    worktree_support::git(&repo.worktree, &["commit", "-q", "-m", "reapprove"]);
    support::write(&repo.worktree, "tests/old.rs", "//! Old.\n");
    worktree_support::git(&repo.worktree, &["add", "-A"]);
    worktree_support::git(&repo.worktree, &["commit", "-q", "-m", "add a root test"]);
    support::write(
        &repo.worktree,
        "tests/old.rs",
        "//! Changed before the run.\n",
    );
    support::write(&repo.worktree, "src/tests/new.rs", "//! A new test.\n");
    worktree_support::mode(&repo, "done");
    worktree_support::run(&repo, &[FOLDER, TASK]).expect("the run succeeds");
    let tip = worktree_support::tip(&repo.checkout, "osq/001-a");
    let status = worktree_support::name_status(&repo.worktree, &tip);
    assert!(
        status.contains("A\tsrc/tests/new.rs\n"),
        "the untracked test file: {status}"
    );
    assert!(
        !status.contains("tests/old.rs"),
        "a preexisting modified test outside the scope stays out: {status}"
    );
}

/// Proves the elapsed seconds count whole seconds from the last started event.
///
/// Covers: rust-run/trailers-from-the-last-started-event
#[test]
fn elapsed_counts_whole_seconds_from_the_last_started_event() {
    let root = support::scratch("message-elapsed");
    support::write(
        &root,
        ".run/events/1.jsonl",
        "not json\n{\"type\":\"started\",\"timestamp\":\"1970-01-01T00:16:35.000Z\",\"data\":{\"harness\":\"pi\",\"model\":\"m\",\"osqVersion\":\"v\"}}\n",
    );
    assert_eq!(
        message::elapsed_seconds(&root, TASK),
        5,
        "five whole seconds"
    );
}

/// Proves only a complete started event gives the model and version trailers.
///
/// Covers: rust-run/trailers-from-the-last-started-event
#[test]
fn trailers_come_from_the_last_complete_started_event() {
    let old = "{\"type\":\"started\",\"timestamp\":\"1970-01-01T00:16:35.000Z\",\"data\":{\"harness\":\"old\",\"model\":\"m0\",\"osqVersion\":\"v0\"}}\n";
    let incomplete = [
        "{\"type\":\"started\",\"timestamp\":\"1970-01-01T00:16:36.000Z\",\"data\":{\"harness\":\"h\"}}\n",
        "{\"type\":\"started\",\"timestamp\":\"1970-01-01T00:16:36.000Z\",\"data\":{\"model\":\"m\",\"osqVersion\":\"v\"}}\n",
        "{\"type\":\"started\",\"timestamp\":\"1970-01-01T00:16:36.000Z\",\"data\":{\"harness\":\"h\",\"model\":\"m\"}}\n",
    ];
    for (index, later) in incomplete.iter().enumerate() {
        let root = support::scratch(&format!("message-trailers-{index}"));
        support::write(&root, ".run/events/1.jsonl", format!("{old}{later}"));
        let trailers = message::read_trailers(&root, TASK);
        let model = trailers
            .iter()
            .find(|trailer| trailer.key == "Osq-Model")
            .map(|trailer| trailer.value.as_str());
        let version = trailers
            .iter()
            .find(|trailer| trailer.key == "Osq-Version")
            .map(|trailer| trailer.value.as_str());
        assert_eq!(model, Some("old m0"), "case {index}: the model");
        assert_eq!(version, Some("v0"), "case {index}: the version");
    }
}

/// The whole seconds of a message's outcome line.
fn elapsed_seconds(message: &str) -> u64 {
    let (_, rest) = message
        .split_once("(elapsed: ")
        .expect("an outcome line with elapsed seconds");
    let (seconds, _) = rest.split_once('s').expect("a whole-second count");
    seconds.parse().expect("the count is a number")
}

/// Keeps the shared repository builder honest about the approval commit.
///
/// Covers: rust-run/verified-task-commit
#[test]
fn the_change_starts_at_the_approval_commit() {
    let repo: Repo = worktree_support::build("approval-commit");
    let tip = worktree_support::tip(&repo.checkout, "osq/001-a");
    assert_eq!(
        worktree_support::message(&repo.worktree, &tip),
        "approve\n",
        "the approval commit"
    );
    assert!(
        repo.worktree.join(CHANGE).join(".run/approved").is_file(),
        "the seal is committed"
    );
}
