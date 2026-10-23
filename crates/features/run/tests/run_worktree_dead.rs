//! Proves a dead task and a usage pause in an osq worktree leave the records
//! and the worktree as TypeScript does.

mod support;
mod worktree_support;

#[allow(dead_code)]
#[path = "../src/feature/pause.rs"]
mod source_pause;

use osq_core::FeatureError;
use osq_kernel_vcs::StatusEntry;

use support::{FOLDER, TASK};

/// The change folder's path in the worktree.
const CHANGE: &str = "openspec/changes/001-a";

/// Proves "Dead task commit": the patch is saved, the agent's outside files are
/// discarded and the dead records are committed on the change's branch.
///
/// Covers: rust-run/dead-task-commit
#[test]
fn dead_task_commit() {
    let repo = worktree_support::build("dead-commit");
    worktree_support::mode(&repo, "outside");
    let error = worktree_support::run(&repo, &[FOLDER, TASK]).expect_err("the task dies");
    match &error {
        FeatureError::Failed { command, .. } => assert_eq!(command, "run", "the command"),
        other => panic!("expected a failed run, got {other:?}"),
    }
    assert_eq!(
        error.to_string(),
        "run failed: task 1 of 001-a died: scope_violation",
        "the ending"
    );
    assert!(
        !repo.worktree.join("src/a.txt").exists(),
        "the in-scope file outside the change folder is discarded"
    );
    assert!(
        !repo.worktree.join("other.txt").exists(),
        "the out-of-scope file is discarded"
    );
    let patch = support::read_text(&repo.worktree, &format!("{CHANGE}/.run/dead/1.patch"));
    assert!(
        patch.contains("+outside"),
        "the patch holds other.txt: {patch}"
    );
    assert!(patch.contains("+a"), "the patch holds src/a.txt: {patch}");

    let tip = worktree_support::tip(&repo.checkout, "osq/001-a");
    let started = worktree_support::last_started(&repo);
    let model = started.model.expect("the started event names a model");
    let version = started
        .osq_version
        .expect("the started event names a version");
    let message = worktree_support::message(&repo.worktree, &tip);
    let prefix = "osq: 001 task 1 dead, reason scope_violation\n\nWhen run, it works\n[dead] task 1 dead (reason: scope_violation, elapsed: ";
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
        format!("A\t{CHANGE}/.run/dead/1.md"),
        format!("A\t{CHANGE}/.run/dead/1.patch"),
        format!("A\t{CHANGE}/.run/events/1.jsonl"),
    ];
    expected.sort();
    assert_eq!(actual, expected, "the commit's paths");
}

/// Proves "Dead task commit fails": a refused dead commit fails the run and
/// leaves the dead records as the steps wrote them.
///
/// Covers: rust-run/dead-task-commit-fails
#[test]
fn dead_task_commit_fails() {
    let repo = worktree_support::build("dead-refused");
    worktree_support::mode(&repo, "outside");
    worktree_support::refuse_commits(&repo);
    let before = worktree_support::tip(&repo.checkout, "osq/001-a");
    let error = worktree_support::run(&repo, &[FOLDER, TASK]).expect_err("the commit is refused");
    let text = error.to_string();
    let prefix = "run failed: task 1 of 001-a died: scope_violation; osq could not commit it: ";
    assert!(
        text.starts_with(prefix),
        "the failure starts with {prefix:?}: {text}"
    );
    assert!(text.contains("refused by hook"), "git's output: {text}");
    assert!(
        support::exists(&repo.worktree, &format!("{CHANGE}/.run/dead/1.md")),
        "the dead marker stays"
    );
    assert!(
        support::exists(&repo.worktree, &format!("{CHANGE}/.run/dead/1.patch")),
        "the dead patch stays"
    );
    assert_eq!(
        worktree_support::tip(&repo.checkout, "osq/001-a"),
        before,
        "the tip is still the approval commit"
    );
}

/// Proves "Paused worktree discards outside files": a usage pause keeps the
/// pause file, drops the executor's file outside the change folder and makes
/// no commit.
///
/// Covers: rust-run/paused-worktree-discards-outside-files
#[test]
fn paused_worktree_discards_outside_files() {
    let repo = worktree_support::build("paused-discard");
    worktree_support::use_limit_pi(&repo);
    let before = worktree_support::tip(&repo.checkout, "osq/001-a");
    let error = worktree_support::run(&repo, &[FOLDER, TASK]).expect_err("the run pauses");
    assert_eq!(
        error.to_string(),
        "run failed: task 1 of 001-a paused on a usage limit",
        "the ending"
    );
    assert!(
        support::exists(&repo.worktree, &format!("{CHANGE}/.run/paused.md")),
        "the pause file stays"
    );
    assert!(
        !repo.worktree.join("src/a.txt").exists(),
        "the executor's file outside the change folder is discarded"
    );
    assert_eq!(
        worktree_support::tip(&repo.checkout, "osq/001-a"),
        before,
        "the pause makes no commit"
    );
}

/// Proves a change folder at the tree's root has nothing outside it, as
/// TypeScript's `outsideChange` answers for an empty change folder.
///
/// Covers: rust-run/paused-worktree-discards-outside-files
#[test]
fn a_change_at_the_root_has_nothing_outside() {
    let root = support::scratch("pause-root-change");
    let status = [StatusEntry {
        code: "??".to_owned(),
        path: "src/a.txt".to_owned(),
        from: None,
    }];
    assert!(
        source_pause::outside_change(&root, &root, &status).is_empty(),
        "nothing lies outside a change folder at the root"
    );
}
