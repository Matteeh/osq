//! Proves the merge writes on scratch repositories and with a program that
//! cannot start.

mod support;

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_vcs::{FastForward, GitVcs, MergeOutcome, StatusEntry, Vcs, VcsError};

use support::Scratch;

/// The committer name every merge write gets.
const COMMITTER_NAME: &str = "Osq Test";
/// The committer email every merge write gets.
const COMMITTER_EMAIL: &str = "osq@example.com";
/// The committer date every merge write gets.
const COMMITTER_DATE: &str = "2000-01-01T00:00:00+0000";

/// A `GitVcs` with the isolated settings and a committer for the merge rows.
fn writes_vcs(scratch: &Scratch, root: &Path) -> GitVcs {
    scratch
        .vcs(root)
        .with_env("GIT_COMMITTER_NAME", COMMITTER_NAME)
        .with_env("GIT_COMMITTER_EMAIL", COMMITTER_EMAIL)
        .with_env("GIT_COMMITTER_DATE", COMMITTER_DATE)
}

/// One status entry with its literal code, path and old path.
fn entry(code: &str, path: &str, from: Option<&str>) -> StatusEntry {
    StatusEntry {
        code: code.to_owned(),
        path: path.to_owned(),
        from: from.map(str::to_owned),
    }
}

/// The commit `rev` names in the repository.
fn rev(scratch: &Scratch, root: &Path, rev: &str) -> String {
    scratch.git(root, &["rev-parse", rev]).trim().to_owned()
}

/// Whether a merge is in progress, which git records in `.git/MERGE_HEAD`.
fn merge_in_progress(root: &Path) -> bool {
    root.join(".git").join("MERGE_HEAD").exists()
}

/// The status entries the repository reports.
fn status(vcs: &GitVcs) -> Vec<StatusEntry> {
    vcs.status().unwrap()
}

/// Asserts a write was refused with a phrase of git's output and returns the
/// error.
fn refused<T: std::fmt::Debug>(result: Result<T, VcsError>, phrase: &str) -> VcsError {
    let error = result.expect_err("the write must be refused");
    let VcsError::Failed { output, .. } = &error else {
        panic!("expected VcsError::Failed, got {error}");
    };
    assert!(
        output.contains(phrase),
        "{output:?} does not contain {phrase:?}"
    );
    error
}

/// Asserts a refused write names `command`.
fn assert_command(error: &VcsError, command: &str) {
    let VcsError::Failed {
        command: actual, ..
    } = error
    else {
        panic!("expected VcsError::Failed, got {error}");
    };
    assert_eq!(actual, command);
}

/// Asserts a write failed to start a program named by `expected`.
fn assert_spawn(result: Result<(), VcsError>, expected: &str) {
    let error = result.expect_err("the missing program must fail");
    let VcsError::Spawn { command, source } = &error else {
        panic!("expected VcsError::Spawn, got {error}");
    };
    assert_eq!(command, expected);
    assert_eq!(source.kind(), std::io::ErrorKind::NotFound);
}

/// The repository of "Merges on a repository".
struct MergeRepo {
    /// The repository's canonical directory.
    root: PathBuf,
    /// The commit `mainside` on `main`.
    mainside: String,
}

/// Adds the branch `clean` from `base` with its commit adding `n.txt`.
fn clean_branch(scratch: &Scratch, root: &Path, base: &str) {
    let _ = scratch.git(root, &["branch", "clean", base]);
    let _ = scratch.git(root, &["checkout", "clean"]);
    scratch.write("repo/n.txt", "n\n");
    let _ = scratch.git(root, &["add", "-A"]);
    let _ = scratch.git(root, &["commit", "-m", "clean"]);
}

/// Adds the branch `clash` from `base` with its commit setting both files to
/// `clash`.
fn clash_branch(scratch: &Scratch, root: &Path, base: &str) {
    let _ = scratch.git(root, &["branch", "clash", base]);
    let _ = scratch.git(root, &["checkout", "clash"]);
    for file in ["a.txt", "b.txt"] {
        scratch.write(&format!("repo/{file}"), "clash\n");
    }
    let _ = scratch.git(root, &["add", "-A"]);
    let _ = scratch.git(root, &["commit", "-m", "clash"]);
}

/// Builds the repository of "Merges on a repository".
fn merge_repository(scratch: &Scratch) -> MergeRepo {
    let path = scratch.path().join("repo");
    let _ = scratch.git(
        scratch.path(),
        &["init", "-b", "main", path.to_str().unwrap()],
    );
    let root = fs::canonicalize(path).unwrap();
    scratch.write("repo/a.txt", "one\n");
    scratch.write("repo/b.txt", "b\n");
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "base"]);
    let base = rev(scratch, &root, "HEAD");
    clean_branch(scratch, &root, &base);
    clash_branch(scratch, &root, &base);
    let _ = scratch.git(&root, &["checkout", "main"]);
    for file in ["a.txt", "b.txt"] {
        scratch.write(&format!("repo/{file}"), "main\n");
    }
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "mainside"]);
    let mainside = rev(scratch, &root, "HEAD");
    MergeRepo { root, mainside }
}

/// Proves the clean merge row and its abort.
fn clean_merge_rows(scratch: &Scratch, repo: &MergeRepo, vcs: &GitVcs) {
    assert_eq!(vcs.merge("clean", false).unwrap(), MergeOutcome::Clean);
    assert_eq!(status(vcs), vec![entry("A ", "n.txt", None)]);
    assert!(merge_in_progress(&repo.root));
    assert_eq!(rev(scratch, &repo.root, "HEAD"), repo.mainside);
    vcs.merge_abort().unwrap();
    assert_eq!(status(vcs), Vec::<StatusEntry>::new());
    assert_eq!(rev(scratch, &repo.root, "HEAD"), repo.mainside);
}

/// Proves the conflicting merge row and its abort.
fn conflict_merge_rows(scratch: &Scratch, repo: &MergeRepo, vcs: &GitVcs) {
    assert_eq!(
        vcs.merge("clash", false).unwrap(),
        MergeOutcome::Conflict {
            paths: vec!["a.txt".to_owned(), "b.txt".to_owned()],
        }
    );
    assert_eq!(
        status(vcs),
        vec![entry("UU", "a.txt", None), entry("UU", "b.txt", None)]
    );
    assert_eq!(rev(scratch, &repo.root, "HEAD"), repo.mainside);
    vcs.merge_abort().unwrap();
    assert_eq!(status(vcs), Vec::<StatusEntry>::new());
    assert_eq!(
        fs::read_to_string(repo.root.join("a.txt")).unwrap(),
        "main\n"
    );
    assert_eq!(rev(scratch, &repo.root, "HEAD"), repo.mainside);
}

/// Proves the abort that fails when no merge is in progress.
fn failed_abort_row(vcs: &GitVcs) {
    let error = refused(vcs.merge_abort(), "no merge to abort");
    assert_command(&error, "git -c core.quotepath=false merge --abort");
    assert_eq!(status(vcs), Vec::<StatusEntry>::new());
}

/// Proves the two refused merges of an unknown rev, whose conflict read is
/// empty.
fn refused_merge_rows(vcs: &GitVcs) {
    let error = refused(vcs.merge("nope", false), "not something we can merge");
    assert_command(
        &error,
        "git -c core.quotepath=false merge --no-ff --no-commit nope",
    );
    assert_eq!(status(vcs), Vec::<StatusEntry>::new());
    let error = refused(vcs.merge("nope", true), "not something we can merge");
    assert_command(&error, "git -c core.quotepath=false merge --squash nope");
    assert_eq!(status(vcs), Vec::<StatusEntry>::new());
}

/// Proves the squashed clean merge row.
fn squash_merge_row(scratch: &Scratch, repo: &MergeRepo, vcs: &GitVcs) {
    assert_eq!(vcs.merge("clean", true).unwrap(), MergeOutcome::Clean);
    assert_eq!(status(vcs), vec![entry("A ", "n.txt", None)]);
    assert!(!merge_in_progress(&repo.root));
    assert_eq!(rev(scratch, &repo.root, "HEAD"), repo.mainside);
}

/// Proves every step of "Merges on a repository".
///
/// Covers: rust-vcs/merges-on-a-repository
#[test]
fn merges_on_a_repository() {
    let scratch = Scratch::new("merge_writes_repository");
    let repo = merge_repository(&scratch);
    let vcs = writes_vcs(&scratch, &repo.root);

    clean_merge_rows(&scratch, &repo, &vcs);
    conflict_merge_rows(&scratch, &repo, &vcs);
    failed_abort_row(&vcs);
    refused_merge_rows(&vcs);
    squash_merge_row(&scratch, &repo, &vcs);
}

/// The repository of "Fast-forwards on a repository".
struct ForwardRepo {
    /// The repository's canonical directory.
    root: PathBuf,
    /// The commit `base` on `main`.
    base: String,
    /// The commit `ahead` names.
    ahead: String,
}

/// Adds the branch `ahead` from `base` and gives its commit.
fn ahead_branch(scratch: &Scratch, root: &Path, base: &str) -> String {
    let _ = scratch.git(root, &["branch", "ahead", base]);
    let _ = scratch.git(root, &["checkout", "ahead"]);
    scratch.write("repo/c.txt", "c2\n");
    scratch.write("repo/m.txt", "m2\n");
    scratch.write("repo/e.txt", "e\n");
    let _ = scratch.git(root, &["add", "-A"]);
    let _ = scratch.git(root, &["commit", "-m", "ahead"]);
    rev(scratch, root, "HEAD")
}

/// Adds the branch `side` from `base` with its commit changing `a.txt`.
fn side_branch(scratch: &Scratch, root: &Path, base: &str) {
    let _ = scratch.git(root, &["branch", "side", base]);
    let _ = scratch.git(root, &["checkout", "side"]);
    scratch.write("repo/a.txt", "side\n");
    let _ = scratch.git(root, &["add", "-A"]);
    let _ = scratch.git(root, &["commit", "-m", "side"]);
}

/// Builds the repository of "Fast-forwards on a repository".
fn forward_repository(scratch: &Scratch) -> ForwardRepo {
    let path = scratch.path().join("repo");
    let _ = scratch.git(
        scratch.path(),
        &["init", "-b", "main", path.to_str().unwrap()],
    );
    let root = fs::canonicalize(path).unwrap();
    for (file, text) in [("a.txt", "a\n"), ("c.txt", "c\n"), ("m.txt", "m\n")] {
        scratch.write(&format!("repo/{file}"), text);
    }
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "base"]);
    let base = rev(scratch, &root, "HEAD");
    let ahead = ahead_branch(scratch, &root, &base);
    side_branch(scratch, &root, &base);
    let _ = scratch.git(&root, &["checkout", "main"]);
    scratch.write("repo/m.txt", "m\ndirty\n");
    let _ = scratch.git(&root, &["mv", "c.txt", "z.txt"]);
    scratch.write("repo/x.txt", "x\n");
    ForwardRepo { root, base, ahead }
}

/// Proves the blocked row: `m.txt` is listed before `z.txt`, whose old path
/// `c.txt` is changed, so sorting puts `c.txt` first.
fn blocked_forward_row(scratch: &Scratch, repo: &ForwardRepo, vcs: &GitVcs) {
    assert_eq!(
        vcs.fast_forward("ahead").unwrap(),
        FastForward::Blocked {
            paths: vec!["c.txt".to_owned(), "m.txt".to_owned()],
        }
    );
    assert_eq!(rev(scratch, &repo.root, "HEAD"), repo.base);
    assert_eq!(
        fs::read_to_string(repo.root.join("m.txt")).unwrap(),
        "m\ndirty\n"
    );
}

/// Proves the done row after the uncommitted changes are undone.
fn done_forward_row(scratch: &Scratch, repo: &ForwardRepo, vcs: &GitVcs) {
    let _ = scratch.git(&repo.root, &["mv", "z.txt", "c.txt"]);
    scratch.write("repo/m.txt", "m\n");
    assert_eq!(
        vcs.fast_forward("ahead").unwrap(),
        FastForward::Done {
            changed: vec!["c.txt".to_owned(), "e.txt".to_owned(), "m.txt".to_owned()],
        }
    );
    assert_eq!(rev(scratch, &repo.root, "HEAD"), repo.ahead);
    assert_eq!(status(vcs), vec![entry("??", "x.txt", None)]);
}

/// Proves the refused row for a commit that is not a fast-forward.
fn refused_forward_row(scratch: &Scratch, repo: &ForwardRepo, vcs: &GitVcs) {
    let error = refused(vcs.fast_forward("side"), "Not possible to fast-forward");
    assert_command(&error, "git -c core.quotepath=false merge --ff-only side");
    assert_eq!(rev(scratch, &repo.root, "HEAD"), repo.ahead);
    assert_eq!(fs::read_to_string(repo.root.join("a.txt")).unwrap(), "a\n");
}

/// Proves the refused row for an unknown rev, whose diff read fails and gives
/// no changed paths.
fn unknown_forward_row(scratch: &Scratch, repo: &ForwardRepo, vcs: &GitVcs) {
    let error = refused(vcs.fast_forward("nope"), "not something we can merge");
    assert_command(&error, "git -c core.quotepath=false merge --ff-only nope");
    assert_eq!(rev(scratch, &repo.root, "HEAD"), repo.ahead);
}

/// Proves every step of "Fast-forwards on a repository".
///
/// Covers: rust-vcs/fast-forwards-on-a-repository
#[test]
fn fast_forwards_on_a_repository() {
    let scratch = Scratch::new("fast_forward_writes_repository");
    let repo = forward_repository(&scratch);
    let vcs = writes_vcs(&scratch, &repo.root);

    blocked_forward_row(&scratch, &repo, &vcs);
    done_forward_row(&scratch, &repo, &vcs);
    refused_forward_row(&scratch, &repo, &vcs);
    unknown_forward_row(&scratch, &repo, &vcs);
}

/// Proves every merge write gives a spawn error naming its command when the
/// program cannot start.
///
/// Covers: rust-vcs/merge-writes-with-a-program-that-cannot-start
#[test]
fn merge_writes_with_a_program_that_cannot_start() {
    let root = PathBuf::from(env!("CARGO_TARGET_TMPDIR"));
    let vcs = GitVcs::new(root).with_program("osq-missing-git");
    let rows = [
        (
            "osq-missing-git -c core.quotepath=false merge --no-ff --no-commit feature",
            vcs.merge("feature", false).map(|_| ()),
        ),
        (
            "osq-missing-git -c core.quotepath=false merge --squash feature",
            vcs.merge("feature", true).map(|_| ()),
        ),
        (
            "osq-missing-git -c core.quotepath=false merge --abort",
            vcs.merge_abort(),
        ),
        (
            "osq-missing-git -c core.quotepath=false status --porcelain=v1 -z --untracked-files=all",
            vcs.fast_forward("feature").map(|_| ()),
        ),
    ];
    for (command, result) in rows {
        assert_spawn(result, command);
    }
}
