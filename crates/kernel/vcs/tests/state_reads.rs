//! Proves the repository state reads on a known repository, an unborn one and
//! a directory outside any repository.

mod support;

use std::fs;
use std::path::PathBuf;

use osq_kernel_vcs::{Head, StatusEntry, Vcs, Worktree};

use support::Scratch;

/// Builds the repository of "State of the read repository" and returns it with
/// the commit `base`.
fn read_repository(scratch: &Scratch) -> (PathBuf, String) {
    let path = scratch.path().join("repo");
    let _ = scratch.git(
        scratch.path(),
        &["init", "-b", "main", path.to_str().unwrap()],
    );
    let root = fs::canonicalize(path).unwrap();
    scratch.write("repo/a.txt", "one\n");
    scratch.write("repo/notes/b.md", "# b\n");
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "base"]);
    let base = scratch.git(&root, &["rev-parse", "HEAD"]).trim().to_owned();
    for branch in ["osq/one", "osq/two", "other"] {
        let _ = scratch.git(&root, &["branch", branch, &base]);
    }
    let _ = scratch.git(&root, &["update-ref", "refs/remotes/origin/trunk", &base]);
    let _ = scratch.git(
        &root,
        &[
            "symbolic-ref",
            "refs/remotes/origin/HEAD",
            "refs/remotes/origin/trunk",
        ],
    );
    let _ = scratch.git(&root, &["config", "osq.example", "yes"]);
    let one = scratch.path().join("repo-one");
    let detached = scratch.path().join("repo-detached");
    let _ = scratch.git(
        &root,
        &["worktree", "add", one.to_str().unwrap(), "osq/one"],
    );
    let _ = scratch.git(
        &root,
        &[
            "worktree",
            "add",
            "--detach",
            detached.to_str().unwrap(),
            &base,
        ],
    );
    scratch.write("repo/a.txt", "one\ntwo\n");
    let _ = scratch.git(&root, &["mv", "notes/b.md", "notes/c.md"]);
    scratch.write("repo/new/ü.txt", "new\n");
    scratch.write("repo/z", "z\n");
    (root, base)
}

/// Proves every read row of "State of the read repository".
///
/// Covers: rust-vcs/state-of-the-read-repository
#[test]
fn state_of_the_read_repository() {
    let scratch = Scratch::new("state_reads_repository");
    let (root, base) = read_repository(&scratch);
    let vcs = scratch.vcs(&root);
    let one = scratch.path().join("repo-one");
    let detached = scratch.path().join("repo-detached");

    assert_eq!(vcs.root().unwrap(), Some(root.clone()));
    assert_eq!(
        vcs.head().unwrap(),
        Head {
            sha: Some(base.clone()),
            branch: Some("main".to_owned()),
        }
    );
    assert_eq!(
        vcs.status().unwrap(),
        vec![
            StatusEntry {
                code: " M".to_owned(),
                path: "a.txt".to_owned(),
                from: None,
            },
            StatusEntry {
                code: "R ".to_owned(),
                path: "notes/c.md".to_owned(),
                from: Some("notes/b.md".to_owned()),
            },
            StatusEntry {
                code: "??".to_owned(),
                path: "new/ü.txt".to_owned(),
                from: None,
            },
            StatusEntry {
                code: "??".to_owned(),
                path: "z".to_owned(),
                from: None,
            },
        ]
    );
    assert_eq!(
        vcs.config_value("osq.example").unwrap(),
        Some("yes".to_owned())
    );
    assert_eq!(vcs.config_value("osq.missing").unwrap(), None);
    assert_eq!(vcs.default_branch("main").unwrap(), "trunk");
    assert_eq!(vcs.show("HEAD", "a.txt").unwrap(), Some("one\n".to_owned()));
    assert_eq!(vcs.show("HEAD", "missing.txt").unwrap(), None);
    assert_eq!(vcs.show("nope", "a.txt").unwrap(), None);
    assert!(vcs.path_exists("HEAD", "notes").unwrap());
    assert!(vcs.path_exists("HEAD", "notes/b.md").unwrap());
    assert!(!vcs.path_exists("HEAD", "missing").unwrap());
    assert!(!vcs.path_exists("nope", "a.txt").unwrap());
    assert_eq!(
        vcs.list_branches("osq/").unwrap(),
        ["osq/one".to_owned(), "osq/two".to_owned()]
    );
    assert_eq!(vcs.list_branches("none/").unwrap(), Vec::<String>::new());
    assert_eq!(
        vcs.worktree_list().unwrap(),
        vec![
            Worktree {
                path: root.display().to_string(),
                branch: Some("main".to_owned()),
                head: Some(base.clone()),
            },
            Worktree {
                path: detached.display().to_string(),
                branch: None,
                head: Some(base.clone()),
            },
            Worktree {
                path: one.display().to_string(),
                branch: Some("osq/one".to_owned()),
                head: Some(base.clone()),
            },
        ]
    );
}

/// Proves every read row of "Unborn repository".
///
/// Covers: rust-vcs/unborn-repository
#[test]
fn unborn_repository() {
    let scratch = Scratch::new("state_reads_unborn");
    let path = scratch.path().join("repo");
    let _ = scratch.git(
        scratch.path(),
        &["init", "-b", "main", path.to_str().unwrap()],
    );
    let root = fs::canonicalize(path).unwrap();
    let vcs = scratch.vcs(&root);

    assert_eq!(
        vcs.head().unwrap(),
        Head {
            sha: None,
            branch: Some("main".to_owned()),
        }
    );
    assert_eq!(vcs.status().unwrap(), Vec::<StatusEntry>::new());
    assert_eq!(vcs.show("HEAD", "a.txt").unwrap(), None);
    assert_eq!(vcs.default_branch("main").unwrap(), "main");
    assert_eq!(vcs.list_branches("").unwrap(), Vec::<String>::new());
    assert_eq!(
        vcs.worktree_list().unwrap(),
        vec![Worktree {
            path: root.display().to_string(),
            branch: Some("main".to_owned()),
            head: Some("0000000000000000000000000000000000000000".to_owned()),
        }]
    );
}

/// Proves every read row of "Directory outside any repository".
///
/// Covers: rust-vcs/directory-outside-any-repository
#[test]
fn directory_outside_any_repository() {
    let scratch = Scratch::new("state_reads_outside");
    let path = scratch.path().join("outside");
    fs::create_dir_all(&path).unwrap();
    let outside = fs::canonicalize(path).unwrap();
    let vcs = scratch.vcs(&outside);

    assert_eq!(vcs.root().unwrap(), None);
    assert_eq!(
        vcs.head().unwrap(),
        Head {
            sha: None,
            branch: None,
        }
    );
    assert_eq!(vcs.status().unwrap(), Vec::<StatusEntry>::new());
    assert_eq!(vcs.config_value("osq.example").unwrap(), None);
    assert_eq!(vcs.default_branch("main").unwrap(), "main");
    assert!(!vcs.path_exists("HEAD", "a.txt").unwrap());
    assert_eq!(vcs.list_branches("").unwrap(), Vec::<String>::new());
    assert_eq!(vcs.worktree_list().unwrap(), Vec::<Worktree>::new());
}
