//! Proves the tree record's path and the bytes each recorded write appends.

mod support;

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use osq_kernel_vcs::{GitVcs, VcsError, append_tree_record};

use support::Scratch;

/// The `at` every recorded line gets.
const AT: &str = "2026-10-22T10:00:00.000Z";

/// The two lines `append_tree_record` writes for `AT`.
const LINES: &str = concat!(
    "{\"at\":\"2026-10-22T10:00:00.000Z\",\"op\":\"worktree-add\",\"root\":\"/r/repo\"}\n",
    "{\"at\":\"2026-10-22T10:00:00.000Z\",\"op\":\"commit\",\"root\":\"/r/wt \\\"x\\\"\"}\n",
);

/// The execute bits a program needs to run.
const EXECUTE_BITS: u32 = 0o111;

/// Builds the repository of "Tree record path and lines" and gives its
/// canonical directory with the worktree added for a new branch.
fn record_repository(scratch: &Scratch) -> (PathBuf, PathBuf) {
    let path = scratch.path().join("repo");
    let _ = scratch.git(
        scratch.path(),
        &["init", "-b", "main", path.to_str().unwrap()],
    );
    let root = fs::canonicalize(path).unwrap();
    scratch.write("repo/a.txt", "one\n");
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "base"]);
    let worktree = scratch.path().join("repo-wt");
    let _ = scratch.git(
        &root,
        &[
            "worktree",
            "add",
            "-b",
            "osq/wt",
            worktree.to_str().unwrap(),
        ],
    );
    (root, fs::canonicalize(worktree).unwrap())
}

/// Writes `#!/bin/sh` that exits 0 and prints nothing, and makes it runnable.
fn silent_program(scratch: &Scratch) -> PathBuf {
    let path = scratch.path().join("silent-git.sh");
    fs::write(&path, "#!/bin/sh\nexit 0\n").unwrap();
    let mut permissions = fs::metadata(&path).unwrap().permissions();
    permissions.set_mode(permissions.mode() | EXECUTE_BITS);
    fs::set_permissions(&path, permissions).unwrap();
    path
}

/// Proves every row of "Tree record path and lines".
///
/// Covers: rust-vcs/tree-record-path-and-lines
#[test]
fn tree_record_path_and_lines() {
    let scratch = Scratch::new("tree_record_repository");
    let (root, worktree) = record_repository(&scratch);
    let expected = root.join(".git").join("osq-trees.jsonl");

    for folder in [root.as_path(), worktree.as_path()] {
        let vcs = scratch.vcs(folder);
        let path = vcs
            .tree_record_path()
            .unwrap()
            .expect("a repository has a tree record path");
        assert_eq!(path, expected);
        let _ = fs::remove_file(&path);
        append_tree_record(&path, AT, "worktree-add", Path::new("/r/repo"));
        append_tree_record(&path, AT, "commit", Path::new("/r/wt \"x\""));
        assert_eq!(fs::read_to_string(&path).unwrap(), LINES);
    }
}

/// Proves "Tree record without git": outside a repository, with a program that
/// prints nothing and with a program that cannot start.
///
/// Covers: rust-vcs/tree-record-without-git
#[test]
fn tree_record_without_git() {
    let scratch = Scratch::new("tree_record_without_git");
    let folder = scratch.path().join("loose");
    fs::create_dir_all(&folder).unwrap();
    let vcs = scratch
        .vcs(&folder)
        .with_env("GIT_CEILING_DIRECTORIES", scratch.path().to_string_lossy());
    assert_eq!(vcs.tree_record_path().unwrap(), None);

    let silent = silent_program(&scratch);
    let printing_nothing = scratch.vcs(&folder).with_program(silent.to_str().unwrap());
    assert_eq!(printing_nothing.tree_record_path().unwrap(), None);

    let missing = GitVcs::new(&folder).with_program("/nonexistent/osq-missing-git");
    let error = missing
        .tree_record_path()
        .expect_err("a program that cannot start must fail");
    let VcsError::Spawn { command, source } = &error else {
        panic!("expected VcsError::Spawn, got {error}");
    };
    assert_eq!(
        command,
        "/nonexistent/osq-missing-git -c core.quotepath=false rev-parse --git-common-dir"
    );
    assert_eq!(source.kind(), std::io::ErrorKind::NotFound);

    let path = folder.join("gone").join("osq-trees.jsonl");
    append_tree_record(&path, AT, "worktree-add", Path::new("/r/repo"));
    assert!(!path.exists());
}
