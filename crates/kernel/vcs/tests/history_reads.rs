//! Proves the history reads on a known repository and with a program that
//! cannot start.

mod support;

use std::fs;
use std::path::PathBuf;

use osq_kernel_vcs::{DiffStat, GitVcs, Vcs, VcsError};

use support::Scratch;

/// Builds the repository of "Reads of the history repository" and returns it
/// with the commit `base`.
fn history_repository(scratch: &Scratch) -> (PathBuf, String) {
    let path = scratch.path().join("repo");
    let _ = scratch.git(
        scratch.path(),
        &["init", "-b", "main", path.to_str().unwrap()],
    );
    let root = fs::canonicalize(path).unwrap();
    scratch.write("repo/a.txt", "one\n");
    scratch.write("repo/skip/s.txt", "s\n");
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "base"]);
    let base = scratch.git(&root, &["rev-parse", "HEAD"]).trim().to_owned();
    let _ = scratch.git(&root, &["checkout", "-b", "feature", &base]);

    scratch.write("repo/a.txt", "one\ntwo\nthree\n");
    scratch.write("repo/skip/s.txt", "s\nt\n");
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "first", "-m", "Osq-Change: 240"]);

    scratch.write("repo/bin.dat", [0u8, 1, 2, 0]);
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "plain"]);

    scratch.write("repo/a.txt", "two\nthree\n");
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(
        &root,
        &[
            "commit",
            "-m",
            "second",
            "-m",
            "Osq-Change: 241\nOsq-Change: 241b",
        ],
    );

    let _ = scratch.git(&root, &["checkout", "main"]);
    scratch.write("repo/m.txt", "m\n");
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "main only"]);

    let tree = scratch
        .git(&root, &["rev-parse", "main^{tree}"])
        .trim()
        .to_owned();
    let lone = scratch
        .git(&root, &["commit-tree", &tree, "-m", "lone"])
        .trim()
        .to_owned();
    let _ = scratch.git(&root, &["branch", "lone", &lone]);
    (root, base)
}

/// Asserts a read failed to start the program named by `expected`.
fn assert_spawn(result: Result<(), VcsError>, expected: &str) {
    let error = result.expect_err("the missing program must fail");
    let VcsError::Spawn { command, source } = &error else {
        panic!("expected VcsError::Spawn, got {error}");
    };
    assert_eq!(command, expected);
    assert_eq!(source.kind(), std::io::ErrorKind::NotFound);
}

/// Proves every read row of "Reads of the history repository".
///
/// Covers: rust-vcs/reads-of-the-history-repository
#[test]
fn reads_of_the_history_repository() {
    let scratch = Scratch::new("history_reads_repository");
    let (root, base) = history_repository(&scratch);
    let vcs = scratch.vcs(&root);

    assert_eq!(
        vcs.merge_base("main", "feature").unwrap(),
        Some(base.clone())
    );
    assert_eq!(vcs.merge_base("main", "lone").unwrap(), None);
    assert_eq!(vcs.merge_base("main", "nope").unwrap(), None);
    assert!(vcs.is_ancestor("main~1", "feature").unwrap());
    assert!(vcs.is_ancestor("main", "main").unwrap());
    assert!(!vcs.is_ancestor("feature", "main").unwrap());
    assert!(!vcs.is_ancestor("nope", "main").unwrap());
    assert_eq!(vcs.count_commits("main", "feature").unwrap(), 3);
    assert_eq!(vcs.count_commits("feature", "main").unwrap(), 1);
    assert_eq!(vcs.count_commits("nope", "main").unwrap(), 0);
    assert_eq!(
        vcs.diff_stat("main", "feature", &[]).unwrap(),
        Some(DiffStat {
            files: 3,
            added: 3,
            removed: 1,
        })
    );
    assert_eq!(
        vcs.diff_stat("main", "feature", &["skip"]).unwrap(),
        Some(DiffStat {
            files: 2,
            added: 2,
            removed: 1,
        })
    );
    assert_eq!(vcs.diff_stat("main", "nope", &[]).unwrap(), None);
    assert_eq!(vcs.diff_stat("main", "lone", &[]).unwrap(), None);
    assert_eq!(
        vcs.trailer_values("main", "feature", "Osq-Change").unwrap(),
        vec!["241".to_owned(), "241b".to_owned(), "240".to_owned()]
    );
    assert_eq!(
        vcs.trailer_values("main", "feature", "Other").unwrap(),
        Vec::<String>::new()
    );
    assert_eq!(
        vcs.trailer_values("feature", "main", "Osq-Change").unwrap(),
        Vec::<String>::new()
    );
    assert_eq!(
        vcs.trailer_values("main", "nope", "Osq-Change").unwrap(),
        Vec::<String>::new()
    );
}

/// Proves every history read gives a spawn error naming its command when the
/// program cannot start.
///
/// Covers: rust-vcs/history-reads-with-a-program-that-cannot-start
#[test]
fn history_reads_with_a_program_that_cannot_start() {
    let root = PathBuf::from(env!("CARGO_TARGET_TMPDIR"));
    let vcs = GitVcs::new(root).with_program("osq-missing-git");
    let rows = [
        (
            "osq-missing-git -c core.quotepath=false merge-base main feature",
            vcs.merge_base("main", "feature").map(|_| ()),
        ),
        (
            "osq-missing-git -c core.quotepath=false merge-base --is-ancestor main feature",
            vcs.is_ancestor("main", "feature").map(|_| ()),
        ),
        (
            "osq-missing-git -c core.quotepath=false rev-list --count main..feature",
            vcs.count_commits("main", "feature").map(|_| ()),
        ),
        (
            "osq-missing-git -c core.quotepath=false diff --numstat --no-renames \
             main...feature -- . :(exclude)skip",
            vcs.diff_stat("main", "feature", &["skip"]).map(|_| ()),
        ),
        (
            "osq-missing-git -c core.quotepath=false log \
             --format=%x1e%(trailers:key=Osq-Change,valueonly,separator=%x1f) \
             main..feature",
            vcs.trailer_values("main", "feature", "Osq-Change")
                .map(|_| ()),
        ),
    ];
    for (command, result) in rows {
        assert_spawn(result, command);
    }
}
