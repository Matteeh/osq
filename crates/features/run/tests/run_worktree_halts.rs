//! Proves a worktree that is off its branch or dirty halts the change before
//! the start, and that a failed task commit records the same halt.

mod support;
mod worktree_support;

use std::fs;

use osq_core::FeatureError;
use osq_core::event::{Event, RegressionReason, parse_event_line};

use support::{FOLDER, TASK};
use worktree_support::Repo;

/// The change folder's path in the worktree.
const CHANGE: &str = "openspec/changes/001-a";

/// One row of "Worktree halts before the start": its name, the change it makes,
/// its reason and the detail its marker and event hold.
type HaltRow = (&'static str, fn(&Repo), RegressionReason, &'static str);

/// Proves every row of "Worktree halts before the start".
///
/// Covers: rust-run/worktree-halts-before-the-start
#[test]
fn worktree_halts_before_the_start() {
    let rows: [HaltRow; 4] = [
        (
            "detached",
            detach,
            RegressionReason::WorktreeOffBranch,
            "detached HEAD",
        ),
        (
            "other-branch",
            other_branch,
            RegressionReason::WorktreeOffBranch,
            "other",
        ),
        (
            "new-files",
            write_two_files,
            RegressionReason::WorktreeDirty,
            "other.txt\nsrc/b.txt",
        ),
        (
            "changed-file",
            change_keep,
            RegressionReason::WorktreeDirty,
            "src/keep.txt",
        ),
    ];
    for (index, (name, change, reason, detail)) in rows.iter().enumerate() {
        let repo = worktree_support::build(&format!("halt-{index}-{name}"));
        worktree_support::mode(&repo, "done");
        let before = worktree_support::tip(&repo.checkout, "osq/001-a");
        change(&repo);
        let error =
            worktree_support::run_in_worktree(&repo, &[FOLDER, TASK]).expect_err("the tree halts");
        match &error {
            FeatureError::Failed { command, .. } => assert_eq!(command, "run", "{name}: command"),
            other => panic!("{name}: expected a failed run, got {other:?}"),
        }
        assert_eq!(
            error.to_string(),
            format!("run failed: spec 001 halted ({})", reason.as_str()),
            "{name}: the ending"
        );
        assert_eq!(
            support::read_text(
                &repo.worktree,
                &format!("{CHANGE}/.run/regressed/change.md")
            ),
            format!("---\nreason: {}\n---\n{detail}\n", reason.as_str()),
            "{name}: the marker"
        );
        match last_change_event(&repo) {
            Event::Regressed(data) => {
                assert_eq!(data.task.as_deref(), Some("change"), "{name}: the task");
                assert_eq!(data.reason, Some(*reason), "{name}: the reason");
                assert_eq!(data.output.as_deref(), Some(*detail), "{name}: the output");
            }
            other => panic!("{name}: expected a regressed event, got {other:?}"),
        }
        assert!(!started(&repo), "{name}: nothing started");
        assert_eq!(
            worktree_support::tip(&repo.checkout, "osq/001-a"),
            before,
            "{name}: the tip is still the approval commit"
        );
    }
}

/// Proves "Worktree check allows the change's records".
///
/// Covers: rust-run/worktree-check-allows-the-change-s-records
#[test]
fn worktree_check_allows_the_change_s_records() {
    let repo = worktree_support::build("halt-allows-records");
    support::write(
        &repo.worktree,
        &format!("{CHANGE}/.run/notes.txt"),
        "a note\n",
    );
    worktree_support::mode(&repo, "done");
    let output = worktree_support::run(&repo, &[FOLDER, TASK]).expect("the run succeeds");
    assert_eq!(output.text, "Task 1 of 001-a done\n", "the ending");
}

/// Proves every row of "Pending verified commit".
///
/// Covers: rust-run/pending-verified-commit
#[test]
fn pending_verified_commit() {
    let rows: [(&str, &str); 3] = [
        ("timestamp", "2026-01-01T00:00:00.000Z\n"),
        ("manual", "---\nmanual: true\n---\n"),
        ("not-manual", "---\nmanual: false\n---\n"),
    ];
    for (name, marker) in rows {
        let repo = worktree_support::build(&format!("pending-{name}"));
        let first = support::read_text(&repo.worktree, &format!("{CHANGE}/tasks/1.md"));
        support::write(&repo.worktree, &format!("{CHANGE}/tasks/2.md"), first);
        support::write_seal(&repo.worktree);
        worktree_support::git(&repo.worktree, &["add", "-A"]);
        worktree_support::git(
            &repo.worktree,
            &["commit", "-q", "-m", "add the second task"],
        );
        let base = worktree_support::tip(&repo.checkout, "osq/001-a");

        support::write(
            &repo.worktree,
            &format!("{CHANGE}/.run/done/{TASK}"),
            marker,
        );
        support::write(
            &repo.worktree,
            &format!("{CHANGE}/.run/results/{TASK}.md"),
            "## Changed\n\nA file.\n",
        );
        support::write(&repo.worktree, "other.txt", "other\n");

        let error = worktree_support::run(&repo, &[FOLDER, "2"]).expect_err("the tree halts");
        assert_eq!(
            error.to_string(),
            "run failed: spec 001 halted (worktree_dirty)",
            "{name}: the ending"
        );
        let tip = worktree_support::tip(&repo.checkout, "osq/001-a");
        if name == "manual" {
            assert_eq!(tip, base, "{name}: the manual marker makes no commit");
            continue;
        }
        assert_ne!(tip, base, "{name}: the pending marker makes a commit");
        let message = worktree_support::message(&repo.worktree, &tip);
        assert!(
            message.starts_with("osq: 001 task 1 verified\n"),
            "{name}: the commit's subject: {message}"
        );
        let mut actual: Vec<String> = worktree_support::name_status(&repo.worktree, &tip)
            .lines()
            .filter(|line| !line.is_empty())
            .map(str::to_owned)
            .collect();
        actual.sort();
        let mut expected = vec![
            format!("A\t{CHANGE}/.run/done/{TASK}"),
            format!("A\t{CHANGE}/.run/results/{TASK}.md"),
        ];
        expected.sort();
        assert_eq!(actual, expected, "{name}: the commit's paths");
    }
}

/// Proves "Failed commits halt the change" for both a verified and a dead task.
///
/// Covers: rust-run/failed-commits-halt-the-change
#[test]
fn failed_commits_halt_the_change() {
    let rows = [
        (
            "verified",
            "done",
            "run failed: task 1 of 001-a is done, but osq could not commit it: ",
        ),
        (
            "dead",
            "outside",
            "run failed: task 1 of 001-a died: scope_violation; osq could not commit it: ",
        ),
    ];
    for (name, mode, prefix) in rows {
        let repo = worktree_support::build(&format!("failed-{name}-commit"));
        worktree_support::mode(&repo, mode);
        worktree_support::refuse_commits(&repo);
        let error = worktree_support::run(&repo, &[FOLDER, TASK]).expect_err("the commit fails");
        assert!(
            error.to_string().starts_with(prefix),
            "{name}: the ending: {error}"
        );
        let marker = support::read_text(
            &repo.worktree,
            &format!("{CHANGE}/.run/regressed/change.md"),
        );
        assert!(
            marker.starts_with("---\nreason: commit_failed\n---\n"),
            "{name}: the marker's frontmatter: {marker}"
        );
        assert!(
            marker.contains("refused by hook"),
            "{name}: the marker's detail: {marker}"
        );
        match last_change_event(&repo) {
            Event::Regressed(data) => {
                assert_eq!(data.task.as_deref(), Some("change"), "{name}: the task");
                assert_eq!(
                    data.reason,
                    Some(RegressionReason::CommitFailed),
                    "{name}: the reason"
                );
                assert!(
                    data.output
                        .as_deref()
                        .is_some_and(|output| output.contains("refused by hook")),
                    "{name}: the output: {:?}",
                    data.output
                );
            }
            other => panic!("{name}: expected a regressed event, got {other:?}"),
        }
    }
}

/// Proves a staged done marker commits just as an untracked one does.
///
/// Covers: rust-run/pending-verified-commit
#[test]
fn staged_done_marker_is_committed() {
    let repo = worktree_support::build("pending-staged");
    let base = worktree_support::tip(&repo.checkout, "osq/001-a");
    support::write(
        &repo.worktree,
        &format!("{CHANGE}/.run/done/{TASK}"),
        "2026-01-01T00:00:00.000Z\n",
    );
    worktree_support::git(
        &repo.worktree,
        &["add", &format!("{CHANGE}/.run/done/{TASK}")],
    );
    let error = worktree_support::run(&repo, &[FOLDER, TASK]).expect_err("the task is done");
    assert_eq!(
        error.to_string(),
        "run failed: Task 1 of 001-a is done; nothing to run",
        "the refusal"
    );
    let tip = worktree_support::tip(&repo.checkout, "osq/001-a");
    assert_ne!(tip, base, "the staged marker made a commit");
    let message = worktree_support::message(&repo.worktree, &tip);
    assert!(
        message.starts_with("osq: 001 task 1 verified\n"),
        "the commit's subject: {message}"
    );
    let status = worktree_support::name_status(&repo.worktree, &tip);
    assert!(
        status.contains(&format!("A\t{CHANGE}/.run/done/{TASK}\n")),
        "the done marker: {status}"
    );
}

/// Proves a done file that is not a task number is not a pending commit.
///
/// Covers: rust-run/pending-verified-commit
#[test]
fn a_done_file_that_is_not_a_number_is_not_committed() {
    let repo = worktree_support::build("pending-not-a-number");
    support::write(
        &repo.worktree,
        &format!("{CHANGE}/.run/done/notes"),
        "a note\n",
    );
    worktree_support::mode(&repo, "done");
    let output = worktree_support::run(&repo, &[FOLDER, TASK]).expect("the run succeeds");
    assert_eq!(output.text, "Task 1 of 001-a done\n", "the ending");
}

/// Proves pending done markers commit in numeric rather than text order.
///
/// Covers: rust-run/pending-verified-commit
#[test]
fn pending_done_markers_commit_in_task_order() {
    let repo = worktree_support::build("pending-order");
    let first = support::read_text(&repo.worktree, &format!("{CHANGE}/tasks/1.md"));
    support::write(&repo.worktree, &format!("{CHANGE}/tasks/2.md"), &first);
    support::write(&repo.worktree, &format!("{CHANGE}/tasks/10.md"), &first);
    support::write_seal(&repo.worktree);
    worktree_support::git(&repo.worktree, &["add", "-A"]);
    worktree_support::git(
        &repo.worktree,
        &["commit", "-q", "-m", "add two more tasks"],
    );
    for task in ["2", "10"] {
        support::write(
            &repo.worktree,
            &format!("{CHANGE}/.run/done/{task}"),
            "2026-01-01T00:00:00.000Z\n",
        );
    }
    let error = worktree_support::run(&repo, &[FOLDER, "2"]).expect_err("task two is done");
    assert_eq!(
        error.to_string(),
        "run failed: Task 2 of 001-a is done; nothing to run",
        "the refusal"
    );
    let tip = worktree_support::tip(&repo.checkout, "osq/001-a");
    let message = worktree_support::message(&repo.worktree, &tip);
    assert!(
        message.starts_with("osq: 001 task 10 verified\n"),
        "task ten commits last: {message}"
    );
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

/// Whether the task's event stream holds a `started` event.
fn started(repo: &Repo) -> bool {
    let path = repo.worktree.join(CHANGE).join(".run/events/1.jsonl");
    fs::read_to_string(path).is_ok_and(|text| {
        text.lines()
            .filter_map(|line| parse_event_line(line.trim()).ok())
            .any(|envelope| matches!(envelope.event, Event::Started(_)))
    })
}

/// Detaches the worktree's HEAD.
fn detach(repo: &Repo) {
    worktree_support::git(&repo.worktree, &["checkout", "-q", "--detach"]);
}

/// Puts the worktree on a branch other than `osq/001-a`.
fn other_branch(repo: &Repo) {
    worktree_support::git(&repo.worktree, &["checkout", "-q", "-b", "other"]);
}

/// Writes one tracked-adjacent and one out-of-scope file.
fn write_two_files(repo: &Repo) {
    support::write(&repo.worktree, "src/b.txt", "b\n");
    support::write(&repo.worktree, "other.txt", "other\n");
}

/// Changes a committed file.
fn change_keep(repo: &Repo) {
    support::write(&repo.worktree, "src/keep.txt", "changed\n");
}
