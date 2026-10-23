//! Proves the branch, worktree, index and commit writes on scratch
//! repositories and with a program that cannot start.

mod support;

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_vcs::{DiffStat, GitVcs, StatusEntry, Vcs, VcsError};

use support::Scratch;

/// The author date every test write gets.
const AUTHOR_DATE: &str = "2000-01-01T00:00:00+0000";
/// The committer name every test write gets.
const COMMITTER_NAME: &str = "Osq Test";
/// The committer email every test write gets.
const COMMITTER_EMAIL: &str = "osq@example.com";
/// The committer date every test write gets.
const COMMITTER_DATE: &str = "2000-01-01T00:00:00+0000";
/// The author the commit rows use.
const BOT: &str = "Osq Bot <bot@example.com>";

/// A `GitVcs` with the isolated settings and the committer and date variables.
fn writes_vcs(scratch: &Scratch, root: &Path) -> GitVcs {
    scratch
        .vcs(root)
        .with_env("GIT_AUTHOR_DATE", AUTHOR_DATE)
        .with_env("GIT_COMMITTER_NAME", COMMITTER_NAME)
        .with_env("GIT_COMMITTER_EMAIL", COMMITTER_EMAIL)
        .with_env("GIT_COMMITTER_DATE", COMMITTER_DATE)
}

/// The commit `rev` names in the repository.
fn rev(scratch: &Scratch, root: &Path, rev: &str) -> String {
    scratch.git(root, &["rev-parse", rev]).trim().to_owned()
}

/// The trimmed value of one `git log -1` format for `commit`.
fn log_format(scratch: &Scratch, root: &Path, commit: &str, format: &str) -> String {
    scratch
        .git(root, &["log", "-1", &format!("--format={format}"), commit])
        .trim()
        .to_owned()
}

/// The commits `git rev-list --parents` names after `commit`, in order.
fn parents(scratch: &Scratch, root: &Path, commit: &str) -> Vec<String> {
    scratch
        .git(root, &["rev-list", "--parents", "-n", "1", commit])
        .split_whitespace()
        .skip(1)
        .map(str::to_owned)
        .collect()
}

/// The author name and email `git log` prints for `commit`.
fn author(scratch: &Scratch, root: &Path, commit: &str) -> (String, String) {
    let text = log_format(scratch, root, commit, "%an%n%ae");
    let mut lines = text.lines().map(str::to_owned);
    (
        lines.next().unwrap_or_default(),
        lines.next().unwrap_or_default(),
    )
}

/// One status entry with its literal code, path and old path.
fn entry(code: &str, path: &str, from: Option<&str>) -> StatusEntry {
    StatusEntry {
        code: code.to_owned(),
        path: path.to_owned(),
        from: from.map(str::to_owned),
    }
}

/// One worktree entry as its path, branch and HEAD.
fn worktree(path: &Path, branch: &str, head: &str) -> (String, Option<String>, Option<String>) {
    (
        path.display().to_string(),
        Some(branch.to_owned()),
        Some(head.to_owned()),
    )
}

/// The worktree entries as path, branch and HEAD triples.
fn worktrees(vcs: &GitVcs) -> Vec<(String, Option<String>, Option<String>)> {
    vcs.worktree_list()
        .unwrap()
        .into_iter()
        .map(|tree| (tree.path, tree.branch, tree.head))
        .collect()
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

/// Builds the repository of "Branch and worktree writes on a repository" and
/// gives its root, the commit `base` and the commit `next`.
fn branch_repository(scratch: &Scratch) -> (PathBuf, String, String) {
    let path = scratch.path().join("repo");
    let _ = scratch.git(
        scratch.path(),
        &["init", "-b", "main", path.to_str().unwrap()],
    );
    let root = fs::canonicalize(path).unwrap();
    scratch.write("repo/a.txt", "one\n");
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "base"]);
    let base = rev(scratch, &root, "HEAD");
    scratch.write("repo/a.txt", "two\n");
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "next"]);
    let next = rev(scratch, &root, "HEAD");
    for branch in ["osq/one", "osq/two"] {
        let _ = scratch.git(&root, &["branch", branch, &base]);
    }
    (root, base, next)
}

/// The branch names a step of the branch scenario expects.
fn branch_names(names: [&str; 3]) -> Vec<String> {
    names.iter().map(|name| (*name).to_owned()).collect()
}

/// Proves the two `create_branch` rows.
fn create_branch_rows(scratch: &Scratch, vcs: &GitVcs, root: &Path, base: &str) {
    vcs.create_branch("osq/new", "main~1").unwrap();
    assert_eq!(
        vcs.list_branches("osq/").unwrap(),
        branch_names(["osq/new", "osq/one", "osq/two"])
    );
    assert_eq!(rev(scratch, root, "osq/new"), base);
    let error = refused(vcs.create_branch("osq/one", "main"), "already exists");
    let VcsError::Failed { command, output } = &error else {
        unreachable!("refused returns VcsError::Failed");
    };
    assert_eq!(command, "git -c core.quotepath=false branch osq/one main");
    assert_eq!(error.to_string(), format!("{command} failed: {output}"));
    assert!(std::error::Error::source(&error).is_none());
    assert_eq!(rev(scratch, root, "osq/one"), base);
}

/// Proves the two `rename_branch` rows.
fn rename_branch_rows(scratch: &Scratch, vcs: &GitVcs, root: &Path, base: &str) {
    vcs.rename_branch("osq/two", "osq/renamed").unwrap();
    assert_eq!(
        vcs.list_branches("osq/").unwrap(),
        branch_names(["osq/new", "osq/one", "osq/renamed"])
    );
    assert_eq!(rev(scratch, root, "osq/renamed"), base);
    let _ = refused(vcs.rename_branch("osq/new", "osq/one"), "already exists");
    assert_eq!(
        vcs.list_branches("osq/").unwrap(),
        branch_names(["osq/new", "osq/one", "osq/renamed"])
    );
}

/// Proves the two accepted and the one refused `worktree_add` row.
fn add_worktree_rows(vcs: &GitVcs, root: &Path, one: &Path, again: &Path, base: &str, next: &str) {
    vcs.worktree_add(one.to_str().unwrap(), "osq/one").unwrap();
    let expected = vec![worktree(root, "main", next), worktree(one, "osq/one", base)];
    assert_eq!(worktrees(vcs), expected);
    let _ = refused(
        vcs.worktree_add(again.to_str().unwrap(), "osq/one"),
        "already checked out",
    );
    assert_eq!(worktrees(vcs), expected);
}

/// Proves the refused, accepted and pruned `worktree_remove` rows.
fn remove_and_prune_worktree_rows(
    scratch: &Scratch,
    vcs: &GitVcs,
    root: &Path,
    one: &Path,
    gone: &Path,
    next: &str,
) {
    scratch.write("repo-one/u.txt", "u\n");
    let _ = refused(
        vcs.worktree_remove(one.to_str().unwrap()),
        "contains modified or untracked files",
    );
    assert_eq!(fs::read_to_string(one.join("u.txt")).unwrap(), "u\n");
    fs::remove_file(one.join("u.txt")).unwrap();
    vcs.worktree_remove(one.to_str().unwrap()).unwrap();
    let remaining = vec![worktree(root, "main", next)];
    assert_eq!(worktrees(vcs), remaining);
    assert!(!one.exists());
    let _ = scratch.git(
        root,
        &["worktree", "add", gone.to_str().unwrap(), "osq/renamed"],
    );
    fs::remove_dir_all(gone).unwrap();
    vcs.worktree_prune().unwrap();
    assert_eq!(worktrees(vcs), remaining);
}

/// Proves every step of "Branch and worktree writes on a repository".
///
/// Covers: rust-vcs/branch-and-worktree-writes-on-a-repository
#[test]
fn branch_and_worktree_writes_on_a_repository() {
    let scratch = Scratch::new("branch_writes_repository");
    let (root, base, next) = branch_repository(&scratch);
    let vcs = writes_vcs(&scratch, &root);
    let one = scratch.path().join("repo-one");
    let again = scratch.path().join("repo-again");
    let gone = scratch.path().join("repo-gone");

    create_branch_rows(&scratch, &vcs, &root, &base);
    rename_branch_rows(&scratch, &vcs, &root, &base);
    add_worktree_rows(&vcs, &root, &one, &again, &base, &next);
    remove_and_prune_worktree_rows(&scratch, &vcs, &root, &one, &gone, &next);
}

/// Proves every branch and worktree write gives a spawn error naming its
/// command when the program cannot start.
///
/// Covers: rust-vcs/branch-and-worktree-writes-with-a-program-that-cannot-start
#[test]
fn branch_and_worktree_writes_with_a_program_that_cannot_start() {
    let root = PathBuf::from(env!("CARGO_TARGET_TMPDIR"));
    let vcs = GitVcs::new(root).with_program("/nonexistent/osq-missing-git");
    let rows = [
        (
            "/nonexistent/osq-missing-git -c core.quotepath=false branch osq/new main",
            vcs.create_branch("osq/new", "main"),
        ),
        (
            "/nonexistent/osq-missing-git -c core.quotepath=false branch -m osq/one osq/renamed",
            vcs.rename_branch("osq/one", "osq/renamed"),
        ),
        (
            "/nonexistent/osq-missing-git -c core.quotepath=false worktree add /tmp/osq-tree osq/one",
            vcs.worktree_add("/tmp/osq-tree", "osq/one"),
        ),
        (
            "/nonexistent/osq-missing-git -c core.quotepath=false worktree remove /tmp/osq-tree",
            vcs.worktree_remove("/tmp/osq-tree"),
        ),
        (
            "/nonexistent/osq-missing-git -c core.quotepath=false worktree prune",
            vcs.worktree_prune(),
        ),
    ];
    for (command, result) in rows {
        assert_spawn(result, command);
    }
}

/// Builds the repository of "Stage and commit on a repository" and gives its
/// root.
fn commit_repository(scratch: &Scratch) -> PathBuf {
    let path = scratch.path().join("repo");
    let _ = scratch.git(
        scratch.path(),
        &["init", "-b", "main", path.to_str().unwrap()],
    );
    let root = fs::canonicalize(path).unwrap();
    scratch.write("repo/a.txt", "one\n");
    scratch.write("repo/gone.txt", "g\n");
    scratch.write("repo/other.txt", "o\n");
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "base"]);
    scratch.write("repo/a.txt", "one\ntwo\n");
    scratch.write("repo/other.txt", "o\ntwo\n");
    fs::remove_file(root.join("gone.txt")).unwrap();
    root
}

/// Proves the three `stage` rows.
fn stage_rows(vcs: &GitVcs) {
    let staged = vec![
        entry("M ", "a.txt", None),
        entry("D ", "gone.txt", None),
        entry(" M", "other.txt", None),
    ];
    vcs.stage(&["a.txt", "gone.txt"]).unwrap();
    assert_eq!(vcs.status().unwrap(), staged);
    vcs.stage(&[]).unwrap();
    assert_eq!(vcs.status().unwrap(), staged);
    let _ = refused(vcs.stage(&["missing.txt"]), "did not match any files");
    assert_eq!(vcs.status().unwrap(), staged);
}

/// Proves the two accepted `commit` rows.
fn commit_rows(scratch: &Scratch, root: &Path, vcs: &GitVcs) {
    let first = vcs
        .commit(&["other.txt"], "first\n\nOsq-Change: 245\n", BOT)
        .unwrap();
    assert_eq!(first, rev(scratch, root, "HEAD"));
    assert_eq!(
        vcs.status().unwrap(),
        vec![entry("M ", "a.txt", None), entry("D ", "gone.txt", None)]
    );
    assert_eq!(log_format(scratch, root, "HEAD", "%s"), "first");
    assert_eq!(
        vcs.trailer_values("HEAD~1", "HEAD", "Osq-Change").unwrap(),
        vec!["245".to_owned()]
    );
    assert_eq!(
        author(scratch, root, "HEAD"),
        ("Osq Bot".to_owned(), "bot@example.com".to_owned())
    );
    let second = vcs.commit(&[], "second\n", BOT).unwrap();
    assert_eq!(second, rev(scratch, root, "HEAD"));
    assert_eq!(vcs.status().unwrap(), Vec::<StatusEntry>::new());
    assert_eq!(
        vcs.diff_stat("HEAD~1", "HEAD", &[]).unwrap(),
        Some(DiffStat {
            files: 2,
            added: 1,
            removed: 1,
        })
    );
}

/// Proves the two refused `commit` rows.
fn refused_commit_rows(scratch: &Scratch, root: &Path, vcs: &GitVcs) {
    let before = rev(scratch, root, "HEAD");
    let error = refused(vcs.commit(&[], "empty\n", BOT), "nothing to commit");
    assert_command(
        &error,
        "git -c core.quotepath=false commit --author=Osq Bot <bot@example.com> -F -",
    );
    assert_eq!(rev(scratch, root, "HEAD"), before);
    let error = refused(vcs.commit(&["a.txt"], "same\n", BOT), "nothing");
    assert_command(
        &error,
        "git -c core.quotepath=false commit --author=Osq Bot <bot@example.com> -F - --only -- a.txt",
    );
    assert_eq!(rev(scratch, root, "HEAD"), before);
}

/// Proves every step of "Stage and commit on a repository".
///
/// Covers: rust-vcs/stage-and-commit-on-a-repository
#[test]
fn stage_and_commit_on_a_repository() {
    let scratch = Scratch::new("commit_writes_repository");
    let root = commit_repository(&scratch);
    let vcs = writes_vcs(&scratch, &root);

    stage_rows(&vcs);
    commit_rows(&scratch, &root, &vcs);
    refused_commit_rows(&scratch, &root, &vcs);
}

/// The repository of "Commit from a tree" with its refs and the feature tree.
struct TreeRepo {
    /// The repository's canonical directory.
    root: PathBuf,
    /// The commit `base`.
    base: String,
    /// The commit `feature` names.
    feature: String,
    /// The commit `other` names.
    other: String,
    /// The tree `feature`'s commit points to.
    feature_tree: String,
}

/// Builds the repository of "Commit from a tree".
fn tree_repository(scratch: &Scratch) -> TreeRepo {
    let path = scratch.path().join("repo");
    let _ = scratch.git(
        scratch.path(),
        &["init", "-b", "main", path.to_str().unwrap()],
    );
    let root = fs::canonicalize(path).unwrap();
    scratch.write("repo/a.txt", "one\n");
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "base"]);
    let base = rev(scratch, &root, "HEAD");
    for branch in ["feature", "other"] {
        let _ = scratch.git(&root, &["branch", branch, &base]);
    }
    let _ = scratch.git(&root, &["checkout", "feature"]);
    scratch.write("repo/f.txt", "f\n");
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "feature"]);
    let feature = rev(scratch, &root, "HEAD");
    let _ = scratch.git(&root, &["checkout", "other"]);
    scratch.write("repo/o.txt", "o\n");
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "other"]);
    let other = rev(scratch, &root, "HEAD");
    let _ = scratch.git(&root, &["checkout", "main"]);
    let feature_tree = rev(scratch, &root, "feature^{tree}");
    TreeRepo {
        root,
        base,
        feature,
        other,
        feature_tree,
    }
}

/// One commit's tree, parents, subject and author.
struct CommitFacts {
    /// The commit's tree.
    tree: String,
    /// The commits after it in `rev-list --parents`, in order.
    parents: Vec<String>,
    /// The commit's subject.
    subject: String,
    /// The commit's author name and email.
    author: (String, String),
}

/// Reads `commit`'s tree, parents, subject and author.
fn commit_facts(scratch: &Scratch, root: &Path, commit: &str) -> CommitFacts {
    CommitFacts {
        tree: rev(scratch, root, &format!("{commit}^{{tree}}")),
        parents: parents(scratch, root, commit),
        subject: log_format(scratch, root, commit, "%s"),
        author: author(scratch, root, commit),
    }
}

/// Asserts `commit`'s tree, parents, subject and author.
fn assert_facts(
    scratch: &Scratch,
    repo: &TreeRepo,
    commit: &str,
    tree: &str,
    commit_parents: &[&str],
    subject: &str,
    commit_author: (&str, &str),
) {
    let facts = commit_facts(scratch, &repo.root, commit);
    assert_eq!(facts.tree, tree);
    assert_eq!(
        facts.parents,
        commit_parents
            .iter()
            .map(|parent| (*parent).to_owned())
            .collect::<Vec<String>>()
    );
    assert_eq!(facts.subject, subject);
    assert_eq!(
        facts.author,
        (commit_author.0.to_owned(), commit_author.1.to_owned())
    );
}

/// Asserts `main`, `feature`, `other` and HEAD still name their commits.
fn assert_refs(scratch: &Scratch, repo: &TreeRepo) {
    assert_eq!(rev(scratch, &repo.root, "main"), repo.base);
    assert_eq!(rev(scratch, &repo.root, "feature"), repo.feature);
    assert_eq!(rev(scratch, &repo.root, "other"), repo.other);
    assert_eq!(rev(scratch, &repo.root, "HEAD"), repo.base);
}

/// Proves every row of "Commit from a tree".
///
/// Covers: rust-vcs/commit-from-a-tree
#[test]
fn commit_from_a_tree() {
    let scratch = Scratch::new("commit_tree_repository");
    let repo = tree_repository(&scratch);
    let vcs = writes_vcs(&scratch, &repo.root);

    let commit = vcs
        .commit_tree("feature", "main", "bridge\n", BOT, &[])
        .unwrap();
    assert_facts(
        &scratch,
        &repo,
        &commit,
        &repo.feature_tree,
        &[repo.base.as_str()],
        "bridge",
        ("Osq Bot", "bot@example.com"),
    );
    assert_refs(&scratch, &repo);

    let commit = vcs
        .commit_tree("feature", "main", "bridge\n", BOT, &["feature", "other"])
        .unwrap();
    assert_facts(
        &scratch,
        &repo,
        &commit,
        &repo.feature_tree,
        &[
            repo.base.as_str(),
            repo.feature.as_str(),
            repo.other.as_str(),
        ],
        "bridge",
        ("Osq Bot", "bot@example.com"),
    );
    assert_refs(&scratch, &repo);

    let commit = vcs
        .commit_tree(
            "feature",
            "main",
            "bridge\n",
            "Osq Bot<bot@example.com>",
            &[],
        )
        .unwrap();
    assert_eq!(
        commit_facts(&scratch, &repo.root, &commit).author,
        ("Osq Bot".to_owned(), "bot@example.com".to_owned())
    );
    assert_refs(&scratch, &repo);

    let commit = vcs
        .commit_tree("feature", "main", "bridge\n", "Osq Bot", &[])
        .unwrap();
    assert_eq!(
        commit_facts(&scratch, &repo.root, &commit).author,
        ("Osq Bot".to_owned(), String::new())
    );
    assert_refs(&scratch, &repo);

    let _ = refused(
        vcs.commit_tree("feature", "main", "bridge\n", "<x@example.com>", &[]),
        "empty ident name",
    );
    assert_refs(&scratch, &repo);
    assert_eq!(vcs.status().unwrap(), Vec::<StatusEntry>::new());
}

/// Proves "Commit from a tree that git is set to sign".
///
/// Covers: rust-vcs/commit-from-a-tree-that-git-is-set-to-sign
#[test]
fn commit_from_a_tree_that_git_is_set_to_sign() {
    let scratch = Scratch::new("commit_tree_signed");
    let repo = tree_repository(&scratch);
    let _ = scratch.git(&repo.root, &["config", "commit.gpgSign", "true"]);
    let _ = scratch.git(&repo.root, &["config", "gpg.program", "osq-missing-gpg"]);
    let vcs = writes_vcs(&scratch, &repo.root);

    let error = refused(
        vcs.commit_tree("feature", "main", "signed\n", BOT, &["other"]),
        "gpg failed to sign the data",
    );
    assert_command(
        &error,
        "git -c core.quotepath=false commit-tree feature^{tree} -p main -p other -F - -S",
    );
    assert_eq!(rev(&scratch, &repo.root, "main"), repo.base);
}

/// Proves every commit write gives a spawn error naming its command, or
/// returns `Ok(())` for an empty stage, when the program cannot start.
///
/// Covers: rust-vcs/commit-writes-with-a-program-that-cannot-start
#[test]
fn commit_writes_with_a_program_that_cannot_start() {
    let root = PathBuf::from(env!("CARGO_TARGET_TMPDIR"));
    let vcs = GitVcs::new(root).with_program("/nonexistent/osq-missing-git");
    vcs.stage(&[]).unwrap();
    let rows = [
        (
            "/nonexistent/osq-missing-git -c core.quotepath=false add -A -- a.txt",
            vcs.stage(&["a.txt"]),
        ),
        (
            "/nonexistent/osq-missing-git -c core.quotepath=false add -- a.txt",
            vcs.commit(&["a.txt"], "m\n", BOT).map(|_| ()),
        ),
        (
            "/nonexistent/osq-missing-git -c core.quotepath=false commit --author=Osq Bot <bot@example.com> -F -",
            vcs.commit(&[], "m\n", BOT).map(|_| ()),
        ),
        (
            "/nonexistent/osq-missing-git -c core.quotepath=false config --type=bool --get commit.gpgSign",
            vcs.commit_tree("feature", "main", "m\n", BOT, &[])
                .map(|_| ()),
        ),
    ];
    for (command, result) in rows {
        assert_spawn(result, command);
    }
}
