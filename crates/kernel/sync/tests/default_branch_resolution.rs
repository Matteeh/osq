//! Proves "Conflicts resolved to the default branch": a caller lists the
//! conflicted paths the sync takes the default branch's version of.

mod support;

use std::path::Path;

use osq_core::event::SyncStopReason;
use osq_kernel_config::{Limits, Timeouts, VcsConfig};
use osq_kernel_sync::{
    SyncKind, SyncOptions, SyncOutcome, SyncRequest, SyncStop, sync_change_taking_default,
};
use support::{ChangeTree, SyncRepo};

/// The author every sync commit carries.
const AUTHOR: &str = "osq <osq@example.invalid>";

/// The options "Conflicts resolved to the default branch" uses.
fn options() -> SyncOptions {
    SyncOptions {
        records: false,
        verify: true,
        tasks: None,
    }
}

/// Runs the sync kernel on one change with the row's listed paths.
fn sync(change: &ChangeTree, paths: &[&str]) -> Result<SyncOutcome, SyncStop> {
    let settings = VcsConfig {
        author: Some(AUTHOR.to_owned()),
        ..VcsConfig::default()
    };
    let timeouts = Timeouts::default();
    let limits = Limits::default();
    let paths: Vec<String> = paths.iter().map(|path| (*path).to_owned()).collect();
    let request = SyncRequest {
        worktree: &change.path,
        folder: &change.folder,
        kind: SyncKind::Archived,
        default_branch: "main",
        settings: &settings,
        timeouts: &timeouts,
        limits: &limits,
        options: options(),
    };
    sync_change_taking_default(&request, &paths)
}

/// The commit and its parents, most recent first.
fn parents(repo: &SyncRepo, dir: &Path, commit: &str) -> Vec<String> {
    repo.git(dir, &["rev-list", "--parents", "-n", "1", commit])
        .split_whitespace()
        .map(ToOwned::to_owned)
        .collect()
}

/// Arranges the row's repository: `main` adds `src/two.txt`, the branch writes
/// both files, and the branch's head is returned.
fn arrange(name: &str) -> (SyncRepo, ChangeTree, String) {
    let repo = SyncRepo::new(name);
    repo.main_file("src/two.txt", "one\n", "main adds two");
    let change = repo.add_archived_change("001-alpha-orders", "true");
    repo.write(&change.path, "src/two.txt", "two\n");
    repo.commit_all(&change.path, "branch writes two");
    let branch = repo.head(&change.path);
    (repo, change, branch)
}

/// Proves the row where `main` writes `src/one.txt` with `main\n`.
///
/// Covers: rust-sync/conflicts-resolved-to-the-default-branch
#[test]
fn writes_the_default_branch_version() {
    let (repo, change, branch) = arrange("default_branch_resolution-writes");
    repo.main_file("src/one.txt", "main\n", "main edits one");
    let tip = repo.head(repo.checkout());

    let result = sync(&change, &["src/one.txt"]);

    let commit = match result {
        Ok(SyncOutcome::Synced { commit }) => commit,
        other => panic!("the sync commits: {other:?}"),
    };
    assert_eq!(repo.head(&change.path), commit);
    assert_eq!(
        parents(&repo, &change.path, &commit),
        vec![commit, branch, tip]
    );
    assert_eq!(
        repo.message(&repo.head(&change.path)),
        "osq: 001 sync main\n\nOsq-Change: 001-alpha-orders\n"
    );
    assert_eq!(repo.read(&change.path, "src/one.txt"), "main\n");
    assert_eq!(repo.read(&change.path, "src/two.txt"), "two\n");
    assert!(!repo.git_path(&change.path, "MERGE_HEAD").exists());
}

/// Proves the row where `main` removes `src/one.txt`.
///
/// Covers: rust-sync/conflicts-resolved-to-the-default-branch
#[test]
fn removes_a_file_the_default_branch_removed() {
    let (repo, change, branch) = arrange("default_branch_resolution-removes");
    repo.git(repo.checkout(), &["rm", "-q", "src/one.txt"]);
    repo.git(repo.checkout(), &["commit", "-q", "-m", "main removes one"]);
    let tip = repo.head(repo.checkout());

    let result = sync(&change, &["src/one.txt"]);

    let commit = match result {
        Ok(SyncOutcome::Synced { commit }) => commit,
        other => panic!("the sync commits: {other:?}"),
    };
    assert_eq!(repo.head(&change.path), commit);
    assert_eq!(
        parents(&repo, &change.path, &commit),
        vec![commit, branch, tip]
    );
    assert!(!repo.exists(&change.path, "src/one.txt"));
    assert_eq!(repo.read(&change.path, "src/two.txt"), "two\n");
    assert!(!repo.git_path(&change.path, "MERGE_HEAD").exists());
}

/// Proves the row where a listed path does not conflict.
///
/// Covers: rust-sync/conflicts-resolved-to-the-default-branch
#[test]
fn leaves_an_unlisted_conflict_alone() {
    let (repo, change, branch) = arrange("default_branch_resolution-unlisted");
    repo.main_file("src/one.txt", "main\n", "main edits one");

    let result = sync(&change, &["src/other.txt"]);

    assert_eq!(
        result,
        Err(SyncStop {
            reason: SyncStopReason::SyncConflict,
            message: "001-alpha-orders: src/one.txt conflict with main; run osq plan 001, and approving the revised plan restarts osq/001-alpha-orders from main".to_owned(),
            conflicts: vec!["src/one.txt".to_owned()],
        })
    );
    assert_eq!(repo.head(&change.path), branch);
    assert!(!repo.git_path(&change.path, "MERGE_HEAD").exists());
}

/// Proves the row where one of two conflicts is listed.
///
/// Covers: rust-sync/conflicts-resolved-to-the-default-branch
#[test]
fn stops_on_the_conflicts_it_did_not_resolve() {
    let (repo, change, branch) = arrange("default_branch_resolution-remaining");
    repo.write(repo.checkout(), "src/one.txt", "main\n");
    repo.write(repo.checkout(), "src/two.txt", "main\n");
    repo.commit(
        repo.checkout(),
        "main edits both",
        &["src/one.txt", "src/two.txt"],
    );

    let result = sync(&change, &["src/one.txt"]);

    assert_eq!(
        result,
        Err(SyncStop {
            reason: SyncStopReason::SyncConflict,
            message: "001-alpha-orders: src/two.txt conflict with main; run osq plan 001, and approving the revised plan restarts osq/001-alpha-orders from main".to_owned(),
            conflicts: vec!["src/two.txt".to_owned()],
        })
    );
    assert_eq!(repo.head(&change.path), branch);
    assert!(!repo.git_path(&change.path, "MERGE_HEAD").exists());
}

/// Proves the row where both conflicts are listed.
///
/// Covers: rust-sync/conflicts-resolved-to-the-default-branch
#[test]
fn resolves_every_listed_conflict() {
    let (repo, change, branch) = arrange("default_branch_resolution-both");
    repo.write(repo.checkout(), "src/one.txt", "main\n");
    repo.write(repo.checkout(), "src/two.txt", "main\n");
    repo.commit(
        repo.checkout(),
        "main edits both",
        &["src/one.txt", "src/two.txt"],
    );
    let tip = repo.head(repo.checkout());

    let result = sync(&change, &["src/one.txt", "src/two.txt"]);

    let commit = match result {
        Ok(SyncOutcome::Synced { commit }) => commit,
        other => panic!("the sync commits: {other:?}"),
    };
    assert_eq!(repo.head(&change.path), commit);
    assert_eq!(
        parents(&repo, &change.path, &commit),
        vec![commit, branch, tip]
    );
    assert_eq!(repo.read(&change.path, "src/one.txt"), "main\n");
    assert_eq!(repo.read(&change.path, "src/two.txt"), "main\n");
    assert!(!repo.git_path(&change.path, "MERGE_HEAD").exists());
}
