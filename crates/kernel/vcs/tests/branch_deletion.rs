//! Proves a branch deletion drops only a branch whose commits HEAD holds.

mod support;

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_vcs::{Vcs, VcsError};

use support::Scratch;

/// The repository of "Branch deletions", with its commit `base`, the commit
/// `osq/ahead` names and the worktree `osq/busy` is checked out in.
struct DeletionRepo {
    /// The repository's canonical directory.
    root: PathBuf,
    /// The commit `base`.
    base: String,
    /// The commit `osq/ahead` names.
    ahead: String,
    /// The worktree beside the repository.
    busy: PathBuf,
}

/// Builds the repository of "Branch deletions".
fn deletion_repository(scratch: &Scratch) -> DeletionRepo {
    let path = scratch.path().join("repo");
    let _ = scratch.git(
        scratch.path(),
        &["init", "-b", "main", path.to_str().unwrap()],
    );
    let root = fs::canonicalize(path).unwrap();
    scratch.write("repo/a.txt", "one\n");
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "base"]);
    let base = scratch.git(&root, &["rev-parse", "HEAD"]).trim().to_owned();
    for branch in ["osq/merged", "osq/busy"] {
        let _ = scratch.git(&root, &["branch", branch, &base]);
    }
    let _ = scratch.git(&root, &["checkout", "-b", "osq/ahead", &base]);
    scratch.write("repo/a.txt", "two\n");
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "ahead"]);
    let ahead = scratch.git(&root, &["rev-parse", "HEAD"]).trim().to_owned();
    let _ = scratch.git(&root, &["checkout", "main"]);
    let busy = scratch.path().join("repo-busy");
    let _ = scratch.git(
        &root,
        &["worktree", "add", busy.to_str().unwrap(), "osq/busy"],
    );
    DeletionRepo {
        root,
        base,
        ahead,
        busy,
    }
}

/// The repository's branches, sorted.
fn branches(scratch: &Scratch, root: &Path) -> Vec<String> {
    let mut names = scratch
        .git(root, &["branch", "--list", "--format=%(refname:short)"])
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect::<Vec<String>>();
    names.sort();
    names
}

/// The sorted branch names a row expects.
fn names(list: &[&str]) -> Vec<String> {
    let mut names = list
        .iter()
        .map(|name| (*name).to_owned())
        .collect::<Vec<String>>();
    names.sort();
    names
}

/// Asserts git refused the deletion with `command` and a phrase of its output.
fn refused(result: Result<(), VcsError>, command: &str, phrase: &str) {
    let error = result.expect_err("git must refuse the deletion");
    let VcsError::Failed {
        command: actual,
        output,
    } = &error
    else {
        panic!("expected VcsError::Failed, got {error}");
    };
    assert_eq!(actual, command);
    assert!(
        output.contains(phrase),
        "{output:?} does not contain {phrase:?}"
    );
}

/// Proves every row of "Branch deletions".
///
/// Covers: rust-vcs/branch-deletions
#[test]
fn branch_deletions() {
    let scratch = Scratch::new("branch_deletion_repository");
    let repo = deletion_repository(&scratch);
    let vcs = scratch.vcs(&repo.root);

    vcs.delete_branch("osq/merged").unwrap();
    assert_eq!(
        branches(&scratch, &repo.root),
        names(&["main", "osq/ahead", "osq/busy"])
    );

    refused(
        vcs.delete_branch("osq/ahead"),
        "git -c core.quotepath=false branch -d osq/ahead",
        "not fully merged",
    );
    assert_eq!(
        scratch.git(&repo.root, &["rev-parse", "osq/ahead"]).trim(),
        repo.ahead
    );

    refused(
        vcs.delete_branch("osq/busy"),
        "git -c core.quotepath=false branch -d osq/busy",
        "checked out",
    );
    assert_eq!(
        scratch.git(&repo.root, &["rev-parse", "osq/busy"]).trim(),
        repo.base
    );
    assert!(repo.busy.exists());

    refused(
        vcs.delete_branch("osq/missing"),
        "git -c core.quotepath=false branch -d osq/missing",
        "not found",
    );
    assert_eq!(
        branches(&scratch, &repo.root),
        names(&["main", "osq/ahead", "osq/busy"])
    );
}
