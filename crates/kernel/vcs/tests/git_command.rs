//! Proves the command `GitVcs` builds and the error a missing program gives.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use osq_kernel_vcs::{GitVcs, Vcs, VcsError};

/// The environment changes by name, with their values, removed ones as none.
fn environment(command: &std::process::Command) -> BTreeMap<String, Option<String>> {
    command
        .get_envs()
        .map(|(key, value)| {
            (
                key.to_string_lossy().into_owned(),
                value.map(|value| value.to_string_lossy().into_owned()),
            )
        })
        .collect()
}

/// Asserts a read failed to start the program named by `expected`.
fn assert_spawn(result: Result<(), VcsError>, expected: &str) {
    let error = result.expect_err("the missing program must fail");
    let VcsError::Spawn { command, source } = &error;
    assert_eq!(command, expected);
    assert_eq!(source.kind(), std::io::ErrorKind::NotFound);
    assert_eq!(
        error.to_string(),
        format!("could not run {command}: {source}")
    );
    assert_eq!(
        std::error::Error::source(&error).map(ToString::to_string),
        Some(source.to_string())
    );
}

/// Proves a read's command names its program, arguments, directory and
/// environment changes.
///
/// Covers: rust-vcs/command-for-a-read
#[test]
fn command_for_a_read() {
    let command = GitVcs::new("/repo")
        .with_program("git-test")
        .with_env("GIT_CONFIG_NOSYSTEM", "1")
        .command(&["status", "--porcelain=v1"]);
    assert_eq!(command.get_program(), "git-test");
    assert_eq!(
        command.get_args().collect::<Vec<_>>(),
        ["-c", "core.quotepath=false", "status", "--porcelain=v1"]
    );
    assert_eq!(command.get_current_dir(), Some(Path::new("/repo")));
    let changes = environment(&command);
    assert_eq!(changes.len(), 5);
    assert_eq!(
        changes.get("GIT_CONFIG_NOSYSTEM"),
        Some(&Some("1".to_owned()))
    );
    assert_eq!(changes.get("GIT_DIR"), Some(&None));
    assert_eq!(changes.get("GIT_INDEX_FILE"), Some(&None));
    assert_eq!(
        changes.get("GIT_OPTIONAL_LOCKS"),
        Some(&Some("0".to_owned()))
    );
    assert_eq!(changes.get("GIT_WORK_TREE"), Some(&None));
}

/// Proves every state read gives a spawn error naming its command when the
/// program cannot start.
///
/// Covers: rust-vcs/state-reads-with-a-program-that-cannot-start
#[test]
fn state_reads_with_a_program_that_cannot_start() {
    let root = PathBuf::from(env!("CARGO_TARGET_TMPDIR"));
    let vcs = GitVcs::new(root).with_program("osq-missing-git");
    let rows = [
        (
            "osq-missing-git -c core.quotepath=false rev-parse --show-toplevel",
            vcs.root().map(|_| ()),
        ),
        (
            "osq-missing-git -c core.quotepath=false rev-parse --verify --quiet HEAD",
            vcs.head().map(|_| ()),
        ),
        (
            "osq-missing-git -c core.quotepath=false status --porcelain=v1 -z \
             --untracked-files=all",
            vcs.status().map(|_| ()),
        ),
        (
            "osq-missing-git -c core.quotepath=false config --get osq.example",
            vcs.config_value("osq.example").map(|_| ()),
        ),
        (
            "osq-missing-git -c core.quotepath=false symbolic-ref --quiet --short \
             refs/remotes/origin/HEAD",
            vcs.default_branch("main").map(|_| ()),
        ),
        (
            "osq-missing-git -c core.quotepath=false show HEAD:a.txt",
            vcs.show("HEAD", "a.txt").map(|_| ()),
        ),
        (
            "osq-missing-git -c core.quotepath=false cat-file -e HEAD:a.txt",
            vcs.path_exists("HEAD", "a.txt").map(|_| ()),
        ),
        (
            "osq-missing-git -c core.quotepath=false branch --list \
             --format=%(refname:short) osq/*",
            vcs.list_branches("osq/").map(|_| ()),
        ),
        (
            "osq-missing-git -c core.quotepath=false worktree list --porcelain",
            vcs.worktree_list().map(|_| ()),
        ),
    ];
    for (command, result) in rows {
        assert_spawn(result, command);
    }
}
