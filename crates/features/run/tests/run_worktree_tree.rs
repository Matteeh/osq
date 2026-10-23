//! Proves the run feature finds a change in its osq worktree and runs it there.

mod support;
mod worktree_support;

use support::{FOLDER, TASK};
use worktree_support::Repo;

/// Proves "Worktree run finds its tree".
///
/// Covers: rust-run/worktree-run-finds-its-tree
#[test]
fn worktree_run_finds_its_tree() {
    let repo = worktree_support::build("finds-its-tree");
    worktree_support::mode(&repo, "done");
    let output = worktree_support::run(&repo, &[FOLDER, TASK]).expect("the run succeeds");
    assert_eq!(output.text, "Task 1 of 001-a done\n", "the ending");
    let change = format!("openspec/changes/{FOLDER}");
    assert!(
        repo.worktree.join("src/a.txt").is_file(),
        "the worktree's file"
    );
    assert!(
        repo.worktree
            .join(&change)
            .join(".run")
            .join("done")
            .join(TASK)
            .is_file(),
        "the worktree's done marker"
    );
    assert!(
        !repo.checkout.join("src/a.txt").exists(),
        "the checkout holds no executor file"
    );
    assert!(
        !repo
            .checkout
            .join(&change)
            .join(".run")
            .join("done")
            .join(TASK)
            .exists(),
        "the checkout holds no done marker"
    );
}

/// Keeps the shared repository builder honest about where the change sits.
///
/// Covers: rust-run/worktree-run-finds-its-tree
#[test]
fn the_change_starts_in_the_worktree_only() {
    let repo: Repo = worktree_support::build("change-placement");
    let change = format!("openspec/changes/{FOLDER}");
    assert!(
        repo.worktree.join(&change).is_dir(),
        "the worktree's change"
    );
    assert!(
        !repo.checkout.join(&change).exists(),
        "the checkout holds no change"
    );
}

/// Proves an id no change has is refused with the checkout's changes path.
///
/// Covers: rust-run/worktree-run-finds-its-tree
#[test]
fn worktree_run_refuses_an_id_no_change_has() {
    let repo = worktree_support::build("unknown-id");
    worktree_support::mode(&repo, "done");
    let error = worktree_support::run(&repo, &["9", TASK]).expect_err("the id matches nothing");
    let changes = repo.checkout.join("openspec/changes");
    assert_eq!(
        error.to_string(),
        format!("run failed: Spec \"9\" not found in {}", changes.display()),
        "the refusal"
    );
}

/// Proves an archived folder is never a candidate for the id.
///
/// Covers: rust-run/worktree-run-finds-its-tree
#[test]
fn worktree_run_ignores_archived_folders() {
    let repo = worktree_support::build("archived-folder");
    worktree_support::archived_change(&repo, "003-z");
    worktree_support::mode(&repo, "done");
    let error = worktree_support::run(&repo, &["3", TASK]).expect_err("the folder is archived");
    let changes = repo.checkout.join("openspec/changes");
    assert_eq!(
        error.to_string(),
        format!("run failed: Spec \"3\" not found in {}", changes.display()),
        "the refusal"
    );
}

/// Proves git off runs a change in the root even when a worktree names it.
///
/// Covers: rust-run/worktree-run-finds-its-tree
#[test]
fn git_off_runs_the_change_in_the_root() {
    let repo = worktree_support::build("git-off");
    worktree_support::change_into_checkout(&repo);
    worktree_support::disable_git(&repo);
    worktree_support::mode_in(&repo.checkout, "done");
    let output = worktree_support::run(&repo, &[FOLDER, TASK]).expect("the run succeeds");
    assert_eq!(output.text, "Task 1 of 001-a done\n", "the ending");
    let change = format!("openspec/changes/{FOLDER}");
    assert!(
        repo.checkout.join("src/a.txt").is_file(),
        "the checkout's file"
    );
    assert!(
        repo.checkout
            .join(&change)
            .join(".run")
            .join("done")
            .join(TASK)
            .is_file(),
        "the checkout's done marker"
    );
    assert!(
        !repo.worktree.join("src/a.txt").exists(),
        "the worktree holds no executor file"
    );
    assert!(
        !repo
            .worktree
            .join(&change)
            .join(".run")
            .join("done")
            .join(TASK)
            .exists(),
        "the worktree holds no done marker"
    );
}
