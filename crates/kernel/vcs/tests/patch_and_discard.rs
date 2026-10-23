//! Proves the patch and discard writes on scratch repositories.

mod support;

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_vcs::{GitVcs, Vcs, VcsError};

use support::Scratch;

/// The status `git status --porcelain` prints for `root`.
fn status(scratch: &Scratch, root: &Path) -> String {
    scratch.git(root, &["status", "--porcelain"])
}

/// The status `git status --porcelain --untracked-files=all` prints.
fn full_status(scratch: &Scratch, root: &Path) -> String {
    scratch.git(root, &["status", "--porcelain", "--untracked-files=all"])
}

/// The commit `rev` names in `root`.
fn commit(scratch: &Scratch, root: &Path, rev: &str) -> String {
    scratch.git(root, &["rev-parse", rev]).trim().to_owned()
}

/// Initializes a repository `name` under the scratch folder and gives its root.
fn repository(scratch: &Scratch, name: &str) -> PathBuf {
    let path = scratch.path().join(name);
    let _ = scratch.git(
        scratch.path(),
        &["init", "-b", "main", path.to_str().unwrap()],
    );
    fs::canonicalize(path).unwrap()
}

/// Commits the files written under `name` as the repository's first commit.
fn first_commit(scratch: &Scratch, name: &str, root: &Path) {
    let _ = scratch.git(root, &["add", "-A"]);
    let _ = scratch.git(root, &["commit", "-m", name]);
}

/// Builds the repository of "Patch leaves the tree as it was".
fn patched_repository(scratch: &Scratch) -> (PathBuf, GitVcs) {
    let root = repository(scratch, "repo");
    scratch.write("repo/a.txt", "one\n");
    scratch.write("repo/b.txt", "gone\n");
    first_commit(scratch, "base", &root);
    scratch.write("repo/a.txt", "two\n");
    fs::remove_file(root.join("b.txt")).unwrap();
    scratch.write("repo/c.txt", "new\n");
    let _ = scratch.git(&root, &["add", "c.txt"]);
    scratch.write("repo/d.txt", "loose\n");
    let vcs = scratch.vcs(&root);
    (root, vcs)
}

/// Asserts `patch` holds the `diff --git` header for each of `names`.
fn assert_diff_headers(patch: &str, names: &[&str]) {
    for name in names {
        let header = format!("diff --git a/{name} b/{name}");
        assert!(patch.contains(&header), "{patch:?} lacks {header:?}");
    }
}

/// Asserts `patch` holds each of `lines`.
fn assert_lines(patch: &str, lines: &[&str]) {
    for line in lines {
        assert!(patch.contains(line), "{patch:?} lacks {line:?}");
    }
}

/// Proves "Patch leaves the tree as it was".
///
/// Covers: rust-vcs/patch-leaves-the-tree-as-it-was
#[test]
fn patch_leaves_the_tree_as_it_was() {
    let scratch = Scratch::new("patch_leaves_tree_as_it_was");
    let (root, vcs) = patched_repository(&scratch);
    let before = status(&scratch, &root);

    let patch = vcs.patch(None).unwrap();

    assert!(
        patch.starts_with("diff --git a/a.txt b/a.txt"),
        "{patch:?} does not start with a.txt"
    );
    assert_diff_headers(&patch, &["a.txt", "b.txt", "c.txt", "d.txt"]);
    assert_lines(&patch, &["+two", "-gone", "+new", "+loose"]);
    assert_eq!(status(&scratch, &root), before);
}

/// Proves "Patch against a base".
///
/// Covers: rust-vcs/patch-against-a-base
#[test]
fn patch_against_a_base() {
    let scratch = Scratch::new("patch_against_a_base");
    let root = repository(&scratch, "repo");
    scratch.write("repo/a.txt", "one\n");
    first_commit(&scratch, "first", &root);
    let first = commit(&scratch, &root, "HEAD");
    scratch.write("repo/a.txt", "two\n");
    first_commit(&scratch, "second", &root);
    let vcs = scratch.vcs(&root);

    let patch = vcs.patch(Some(&first)).unwrap();

    assert_lines(&patch, &["-one", "+two"]);
}

/// Builds the dirty `-one` worktree of "Discard in an osq worktree".
fn discard_worktree(scratch: &Scratch) -> (PathBuf, GitVcs) {
    let root = repository(scratch, "repo");
    scratch.write("repo/a.txt", "one\n");
    scratch.write("repo/keep.txt", "keep\n");
    first_commit(scratch, "base", &root);
    let _ = scratch.git(&root, &["branch", "osq/one", "main"]);
    let one = scratch.path().join("repo-one");
    let _ = scratch.git(
        &root,
        &["worktree", "add", one.to_str().unwrap(), "osq/one"],
    );
    scratch.write("repo-one/a.txt", "two\n");
    scratch.write("repo-one/c.txt", "new\n");
    let _ = scratch.git(&one, &["add", "c.txt"]);
    scratch.write("repo-one/d/e.txt", "loose\n");
    scratch.write("repo-one/keep.txt", "kept\n");
    let root = fs::canonicalize(one).unwrap();
    let vcs = scratch.vcs(&root);
    (root, vcs)
}

/// Asserts `discard` left the status `expected`.
fn assert_discarded(scratch: &Scratch, root: &Path, expected: &[&str], row: &str) {
    let status = full_status(scratch, root);
    let actual: Vec<&str> = status.lines().collect();
    assert_eq!(actual, expected, "row {row}");
}

/// Proves every row of "Discard in an osq worktree".
///
/// Covers: rust-vcs/discard-in-an-osq-worktree
#[test]
fn discard_in_an_osq_worktree() {
    let rows: [(&str, &[&str], &[&str]); 3] = [
        (
            "none",
            &[],
            &[" M a.txt", "A  c.txt", " M keep.txt", "?? d/e.txt"],
        ),
        ("a_c_d", &["a.txt", "c.txt", "d"], &[" M keep.txt"]),
        ("a", &["a.txt"], &["A  c.txt", " M keep.txt", "?? d/e.txt"]),
    ];
    for (row, paths, expected) in rows {
        let scratch = Scratch::new(&format!("discard_worktree_{row}"));
        let (root, vcs) = discard_worktree(&scratch);
        vcs.discard(paths).unwrap();
        assert_discarded(&scratch, &root, expected, row);
    }
}

/// Asserts a refusal names `git discard` and gives `output`.
fn assert_refused(result: Result<(), VcsError>, output: &str) {
    let error = result.expect_err("discard must be refused");
    let VcsError::Failed {
        command,
        output: got,
    } = &error
    else {
        panic!("expected VcsError::Failed, got {error}");
    };
    assert_eq!(command, "git discard");
    assert_eq!(got, output);
}

/// Asserts `a.txt` in `root` still holds the unpushed change.
fn assert_unchanged(root: &Path) {
    assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "two\n");
}

/// Builds a repository whose `main` commit holds `a.txt`, then dirties it.
fn refusal_repository(scratch: &Scratch) -> PathBuf {
    let root = repository(scratch, "repo");
    scratch.write("repo/a.txt", "one\n");
    first_commit(scratch, "base", &root);
    scratch.write("repo/a.txt", "two\n");
    root
}

/// Proves every row of "Discard refusals".
///
/// Covers: rust-vcs/discard-refusals
#[test]
fn discard_refusals() {
    let linked = Scratch::new("discard_refusal_linked");
    let root = refusal_repository(&linked);
    let vcs = linked.vcs(&root);
    assert_refused(
        vcs.discard(&["a.txt"]),
        "discard requires a linked worktree",
    );
    assert_unchanged(&root);

    let branch = Scratch::new("discard_refusal_branch");
    let root = refusal_repository(&branch);
    let _ = branch.git(&root, &["branch", "work", "main"]);
    let one = branch.path().join("repo-one");
    let _ = branch.git(&root, &["worktree", "add", one.to_str().unwrap(), "work"]);
    branch.write("repo-one/a.txt", "two\n");
    let one = fs::canonicalize(one).unwrap();
    let vcs = branch.vcs(&one);
    assert_refused(
        vcs.discard(&["a.txt"]),
        "discard requires HEAD on a branch starting \"osq/\"",
    );
    assert_unchanged(&one);
}
