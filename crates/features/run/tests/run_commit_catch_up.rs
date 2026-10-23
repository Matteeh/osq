//! Proves a halted worktree change makes its missing commits within the retry
//! budget and clears the halt, and that any other halt refuses the run.

mod support;
mod worktree_support;

use osq_core::event::{Event, FailureReason, RegressionReason, parse_event_line};

use support::{FOLDER, TASK};
use worktree_support::Repo;

/// The change folder's path in the worktree.
const CHANGE: &str = "openspec/changes/001-a";

/// One row of "Commit catch-up": its mode, message, commit subject, the file at
/// the tip and the text that file holds.
type CatchUpRow = (
    &'static str,
    &'static str,
    &'static str,
    &'static str,
    &'static str,
);

/// Proves every row of "Commit catch-up".
///
/// Covers: rust-run/commit-catch-up
#[test]
fn commit_catch_up() {
    let rows: [CatchUpRow; 2] = [
        (
            "done",
            "Task 1 of 001-a is done; nothing to run",
            "osq: 001 task 1 verified",
            "src/a.txt",
            "a\n",
        ),
        (
            "outside",
            "Task 1 of 001-a is dead; nothing to run",
            "osq: 001 task 1 dead, reason scope_violation",
            "openspec/changes/001-a/.run/dead/1.patch",
            "+outside",
        ),
    ];
    for (index, (mode, message, subject, file, text)) in rows.iter().enumerate() {
        let repo = worktree_support::build(&format!("catch-up-{index}-{mode}"));
        worktree_support::mode(&repo, mode);
        worktree_support::refuse_commits(&repo);
        worktree_support::run(&repo, &[FOLDER, TASK]).expect_err("the first commit fails");
        support::remove(&repo.checkout, ".git/hooks/pre-commit");

        let error =
            worktree_support::run(&repo, &[FOLDER, TASK]).expect_err("the task already ended");
        assert_eq!(
            error.to_string(),
            format!("run failed: {message}"),
            "{mode}: the ending"
        );
        assert!(
            support::exists(
                &repo.worktree,
                &format!("{CHANGE}/.run/regressed/change.1.md")
            ),
            "{mode}: the halted marker is retained"
        );
        assert!(
            !support::exists(
                &repo.worktree,
                &format!("{CHANGE}/.run/regressed/change.md")
            ),
            "{mode}: the active marker is cleared"
        );
        match last_change_event(&repo) {
            Event::Retry(data) => {
                assert_eq!(data.target, "change", "{mode}: the target");
                assert_eq!(
                    data.reason,
                    FailureReason::CommitFailed,
                    "{mode}: the reason"
                );
                assert_eq!(data.attempt, 2, "{mode}: the attempt");
                assert_eq!(data.automatic, Some(true), "{mode}: the automatic retry");
            }
            other => panic!("{mode}: expected a retry event, got {other:?}"),
        }
        let tip = worktree_support::tip(&repo.checkout, "osq/001-a");
        let message = worktree_support::message(&repo.worktree, &tip);
        assert!(
            message.starts_with(&format!("{subject}\n")),
            "{mode}: the commit's subject: {message}"
        );
        let content = worktree_support::git(&repo.worktree, &["show", &format!("{tip}:{file}")]);
        assert!(
            content.contains(text),
            "{mode}: {file} holds {text:?}: {content}"
        );
    }
}

/// Proves every row of "Catch-up runs out".
///
/// Covers: rust-run/catch-up-runs-out
#[test]
fn catch_up_runs_out() {
    let rows: [(u64, usize, &str, bool); 3] = [
        (
            0,
            1,
            "Change 001-a is halted (commit_failed); run osq retry 001 change",
            false,
        ),
        (
            1,
            1,
            "task 1 of 001-a is done, but osq could not commit it: ",
            true,
        ),
        (
            1,
            2,
            "Change 001-a is halted (commit_failed); run osq retry 001 change",
            false,
        ),
    ];
    for (index, (retries, further, message, starts)) in rows.iter().enumerate() {
        let repo = worktree_support::build(&format!("catch-up-out-{index}"));
        worktree_support::mode(&repo, "done");
        let config = support::read_text(&repo.checkout, "osq.toml");
        support::write(
            &repo.checkout,
            "osq.toml",
            format!("{config}[gates]\ncommitRetries = {retries}\n"),
        );
        worktree_support::refuse_commits(&repo);
        worktree_support::run(&repo, &[FOLDER, TASK]).expect_err("the first commit fails");
        let mut last = None;
        for _ in 0..*further {
            last = Some(
                worktree_support::run(&repo, &[FOLDER, TASK]).expect_err("the run stays halted"),
            );
        }
        let error = last.expect("the row makes at least one further run");
        let expected = format!("run failed: {message}");
        if *starts {
            assert!(
                error.to_string().starts_with(&expected),
                "{index}: the ending starts with {expected:?}: {error}"
            );
        } else {
            assert_eq!(error.to_string(), expected, "{index}: the ending");
        }
        let marker = support::read_text(
            &repo.worktree,
            &format!("{CHANGE}/.run/regressed/change.md"),
        );
        assert!(
            marker.starts_with("---\nreason: commit_failed\n---\n"),
            "{index}: the marker's frontmatter: {marker}"
        );
    }
}

/// Proves "Other halts refuse".
///
/// Covers: rust-run/other-halts-refuse
#[test]
fn other_halts_refuse() {
    let repo: Repo = worktree_support::build("other-halt-refuses");
    support::write(
        &repo.worktree,
        &format!("{CHANGE}/.run/regressed/change.md"),
        "---\nreason: worktree_dirty\n---\nother.txt\n",
    );
    let files = support::tree(&repo.worktree, CHANGE);
    let status = support::status(&repo.worktree);
    let error = worktree_support::run(&repo, &[FOLDER, TASK]).expect_err("the change is halted");
    assert_eq!(
        error.to_string(),
        "run failed: Change 001-a is halted (worktree_dirty); run osq retry 001 change",
        "the ending"
    );
    assert_eq!(
        support::tree(&repo.worktree, CHANGE),
        files,
        "the worktree's files are as they were"
    );
    assert_eq!(
        support::status(&repo.worktree),
        status,
        "the worktree's git status is as it was"
    );
}

/// Proves only the human retry resets the budget and only `commit_failed`
/// counts against it.
///
/// Covers: rust-run/commit-catch-up
#[test]
fn manual_retry_resets_the_budget() {
    let repo = worktree_support::build("catch-up-manual-reset");
    worktree_support::mode(&repo, "done");
    let config = support::read_text(&repo.checkout, "osq.toml");
    support::write(
        &repo.checkout,
        "osq.toml",
        format!("{config}[gates]\ncommitRetries = 1\n"),
    );
    support::write(
        &repo.worktree,
        &format!("{CHANGE}/.run/regressed/change.md"),
        "---\nreason: commit_failed\n---\nrefused\n",
    );
    let events = [
        r#"{"type":"regressed","timestamp":"2020-01-01T00:00:00.000Z","data":{"task":"change","reason":"commit_failed"}}"#,
        r#"{"type":"regressed","timestamp":"2020-01-01T00:00:01.000Z","data":{"task":"change","reason":"commit_failed"}}"#,
        r#"{"type":"retry","timestamp":"2020-01-01T00:00:02.000Z","data":{"target":"change","reason":"commit_failed","attempt":2}}"#,
        r#"{"type":"regressed","timestamp":"2020-01-01T00:00:03.000Z","data":{"task":"change","reason":"commit_failed"}}"#,
        r#"{"type":"regressed","timestamp":"2020-01-01T00:00:04.000Z","data":{"task":"change","reason":"worktree_dirty"}}"#,
    ];
    support::write(
        &repo.worktree,
        &format!("{CHANGE}/.run/events/change.jsonl"),
        format!("{}\n", events.join("\n")),
    );
    let output = worktree_support::run(&repo, &[FOLDER, TASK]).expect("the budget is reset");
    assert_eq!(output.text, "Task 1 of 001-a done\n", "the run goes on");
}

/// Proves an untracked dead marker commits while a non-number and an existing
/// patch stay as they are.
///
/// Covers: rust-run/commit-catch-up
#[test]
fn pending_dead_keeps_its_patch() {
    let repo = worktree_support::build("catch-up-pending-dead");
    support::write(
        &repo.worktree,
        &format!("{CHANGE}/.run/dead/1.md"),
        "---\nreason: timeout\n---\n",
    );
    support::write(
        &repo.worktree,
        &format!("{CHANGE}/.run/dead/1.patch"),
        "+kept\n",
    );
    support::write(
        &repo.worktree,
        &format!("{CHANGE}/.run/dead/notes.md"),
        "---\nreason: timeout\n---\n",
    );
    support::write(
        &repo.worktree,
        &format!("{CHANGE}/.run/regressed/change.md"),
        "---\nreason: commit_failed\n---\nrefused\n",
    );
    let error = worktree_support::run(&repo, &[FOLDER, TASK]).expect_err("the task is dead");
    assert_eq!(
        error.to_string(),
        "run failed: Task 1 of 001-a is dead; nothing to run",
        "the ending"
    );
    let tip = worktree_support::tip(&repo.checkout, "osq/001-a");
    let message = worktree_support::message(&repo.worktree, &tip);
    assert!(
        message.starts_with("osq: 001 task 1 dead, reason timeout\n"),
        "the commit's subject: {message}"
    );
    let status = worktree_support::name_status(&repo.worktree, &tip);
    assert!(
        status.contains(&format!("A\t{CHANGE}/.run/dead/1.md\n")),
        "the dead marker: {status}"
    );
    assert!(
        status.contains(&format!("A\t{CHANGE}/.run/dead/1.patch\n")),
        "the kept patch: {status}"
    );
    assert!(
        !status.contains("notes.md"),
        "the non-number stays out: {status}"
    );
    let patch = worktree_support::git(
        &repo.worktree,
        &["show", &format!("{tip}:{CHANGE}/.run/dead/1.patch")],
    );
    assert_eq!(patch, "+kept\n", "the existing patch is kept");
}

/// Proves a pending dead task without a patch writes one before it commits.
///
/// Covers: rust-run/commit-catch-up
#[test]
fn pending_dead_writes_a_missing_patch() {
    let repo = worktree_support::build("catch-up-dead-patch");
    support::write(
        &repo.worktree,
        &format!("{CHANGE}/.run/dead/1.md"),
        "---\nreason: timeout\n---\n",
    );
    support::write(
        &repo.worktree,
        &format!("{CHANGE}/.run/regressed/change.md"),
        "---\nreason: commit_failed\n---\nrefused\n",
    );
    support::write(&repo.worktree, "src/agent.txt", "agent\n");
    let error = worktree_support::run(&repo, &[FOLDER, TASK]).expect_err("the task is dead");
    assert_eq!(
        error.to_string(),
        "run failed: Task 1 of 001-a is dead; nothing to run",
        "the ending"
    );
    let tip = worktree_support::tip(&repo.checkout, "osq/001-a");
    let patch = worktree_support::git(
        &repo.worktree,
        &["show", &format!("{tip}:{CHANGE}/.run/dead/1.patch")],
    );
    assert!(patch.contains("+agent"), "the saved patch: {patch}");
    assert!(
        !repo.worktree.join("src/agent.txt").exists(),
        "the agent's file is discarded"
    );
}

/// Proves a retained marker decides the next ordinal and attempt.
///
/// Covers: rust-run/commit-catch-up
#[test]
fn a_retained_marker_sets_the_ordinal() {
    let repo = worktree_support::build("catch-up-ordinal");
    worktree_support::mode(&repo, "done");
    support::write(
        &repo.worktree,
        &format!("{CHANGE}/.run/regressed/change.md"),
        "---\nreason: commit_failed\n---\nrefused\n",
    );
    support::write(
        &repo.worktree,
        &format!("{CHANGE}/.run/regressed/change.5.md"),
        "---\nreason: commit_failed\n---\nold\n",
    );
    let output = worktree_support::run(&repo, &[FOLDER, TASK]).expect("the run goes on");
    assert_eq!(output.text, "Task 1 of 001-a done\n", "the run's ending");
    assert!(
        support::exists(
            &repo.worktree,
            &format!("{CHANGE}/.run/regressed/change.6.md")
        ),
        "the next retained marker"
    );
    assert!(
        !support::exists(
            &repo.worktree,
            &format!("{CHANGE}/.run/regressed/change.md")
        ),
        "the active marker is cleared"
    );
    assert_eq!(last_retry_event(&repo).attempt, 7, "the next attempt");
}

/// The last `retry` event of the change's event stream.
fn last_retry_event(repo: &Repo) -> osq_core::event::RetryData {
    let text = support::read_text(
        &repo.worktree,
        &format!("{CHANGE}/.run/events/change.jsonl"),
    );
    text.lines()
        .filter_map(|line| parse_event_line(line.trim()).ok())
        .filter_map(|envelope| match envelope.event {
            Event::Retry(data) => Some(data),
            _ => None,
        })
        .next_back()
        .expect("the change stream has a retry event")
}

/// The last parsed event of the change's event stream.
fn last_change_event(repo: &Repo) -> Event {
    let text = support::read_text(
        &repo.worktree,
        &format!("{CHANGE}/.run/events/change.jsonl"),
    );
    let line = text
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .expect("the change stream has a line");
    parse_event_line(line.trim())
        .expect("the last change event parses")
        .event
}

/// Proves the marker reason this module compares against stays core's.
///
/// Covers: rust-run/commit-catch-up
#[test]
fn commit_failed_is_core_s_reason() {
    assert_eq!(RegressionReason::CommitFailed.as_str(), "commit_failed");
}
