//! Proves the setup reads on a known repository, a configured hooks folder, a
//! directory outside any repository, and a git program that cannot start.

mod support;

use std::fs;
use std::io::ErrorKind;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use osq_kernel_vcs::{GitVcs, LineEnding, Vcs, VcsError};

use support::Scratch;

/// The first trimmed line of `git --version` in the scratch folder.
fn git_version(scratch: &Scratch) -> String {
    let output = scratch.git(scratch.path(), &["--version"]);
    output
        .trim()
        .lines()
        .next()
        .map_or_else(String::new, |line| line.trim().to_owned())
}

/// Writes one hook file with `mode` under the repository's `.git/hooks`.
fn write_hook(root: &Path, name: &str, mode: u32) {
    let path = root.join(".git/hooks").join(name);
    fs::write(&path, "#!/bin/sh\n").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(mode)).unwrap();
}

/// Builds the repository of "Setup reads of a repository".
fn setup_repository(scratch: &Scratch) -> PathBuf {
    let path = scratch.path().join("repo");
    let _ = scratch.git(
        scratch.path(),
        &["init", "-b", "main", path.to_str().unwrap()],
    );
    let root = fs::canonicalize(path).unwrap();
    let _ = scratch.git(&root, &["config", "core.autocrlf", "false"]);
    scratch.write("repo/bin.dat", [0_u8, 1, 2]);
    scratch.write("repo/crlf.txt", "a\r\n");
    scratch.write("repo/dir/ü.txt", "a\n");
    scratch.write("repo/empty.txt", "");
    scratch.write("repo/lf.txt", "a\n");
    scratch.write("repo/mixed.txt", "a\r\nb\n");
    let _ = scratch.git(&root, &["add", "-A"]);
    let _ = scratch.git(&root, &["commit", "-m", "base"]);
    for (name, mode) in [
        ("pre-commit", 0o755),
        ("commit-msg", 0o755),
        ("post-commit", 0o644),
        ("pre-push.sample", 0o755),
    ] {
        write_hook(&root, name, mode);
    }
    let folder = root.join(".git/hooks/pre-rebase");
    fs::create_dir_all(&folder).unwrap();
    fs::set_permissions(&folder, fs::Permissions::from_mode(0o755)).unwrap();
    root
}

/// Asserts that a read failed to start the program as `command`.
fn assert_spawn<T>(result: Result<T, VcsError>, command: &str) {
    match result {
        Err(VcsError::Spawn {
            command: got,
            source,
        }) => {
            assert_eq!(got, command);
            assert_eq!(source.kind(), ErrorKind::NotFound);
        }
        Err(other) => panic!("expected Spawn for {command}, got {other}"),
        Ok(_) => panic!("expected Spawn for {command}, got success"),
    }
}

/// Proves every setup read row of "Setup reads of a repository".
///
/// Covers: rust-vcs/setup-reads-of-a-repository
#[test]
fn setup_reads_of_a_repository() {
    let scratch = Scratch::new("setup_reads_repository");
    let root = setup_repository(&scratch);
    let vcs = scratch.vcs(&root);

    assert_eq!(vcs.version().unwrap(), Some(git_version(&scratch)));
    assert_eq!(
        vcs.hook_names().unwrap(),
        ["commit-msg".to_owned(), "pre-commit".to_owned()]
    );
    assert_eq!(
        vcs.line_endings().unwrap(),
        vec![
            LineEnding {
                path: "bin.dat".to_owned(),
                index: "-text".to_owned(),
            },
            LineEnding {
                path: "crlf.txt".to_owned(),
                index: "crlf".to_owned(),
            },
            LineEnding {
                path: "dir/ü.txt".to_owned(),
                index: "lf".to_owned(),
            },
            LineEnding {
                path: "empty.txt".to_owned(),
                index: "none".to_owned(),
            },
            LineEnding {
                path: "lf.txt".to_owned(),
                index: "lf".to_owned(),
            },
            LineEnding {
                path: "mixed.txt".to_owned(),
                index: "mixed".to_owned(),
            },
        ]
    );
}

/// Proves "Hooks folder from config" reads the configured folder.
///
/// Covers: rust-vcs/hooks-folder-from-config
#[test]
fn hooks_folder_from_config() {
    let scratch = Scratch::new("setup_reads_hooks_config");
    let path = scratch.path().join("repo");
    let _ = scratch.git(
        scratch.path(),
        &["init", "-b", "main", path.to_str().unwrap()],
    );
    let root = fs::canonicalize(path).unwrap();
    let hooks = scratch.path().join("configured-hooks");
    fs::create_dir_all(&hooks).unwrap();
    let hook = hooks.join("pre-commit");
    fs::write(&hook, "#!/bin/sh\n").unwrap();
    fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
    let notes = hooks.join("notes.txt");
    fs::write(&notes, "notes\n").unwrap();
    fs::set_permissions(&notes, fs::Permissions::from_mode(0o644)).unwrap();
    let _ = scratch.git(
        &root,
        &["config", "core.hooksPath", hooks.to_str().unwrap()],
    );
    let vcs = scratch.vcs(&root);

    assert_eq!(vcs.hook_names().unwrap(), ["pre-commit".to_owned()]);
}

/// Proves every setup read row of "Setup reads outside a repository".
///
/// Covers: rust-vcs/setup-reads-outside-a-repository
#[test]
fn setup_reads_outside_a_repository() {
    let scratch = Scratch::new("setup_reads_outside");
    let path = scratch.path().join("outside");
    fs::create_dir_all(&path).unwrap();
    let outside = fs::canonicalize(path).unwrap();
    let vcs = scratch.vcs(&outside);

    assert_eq!(vcs.version().unwrap(), Some(git_version(&scratch)));
    assert_eq!(vcs.hook_names().unwrap(), Vec::<String>::new());
    assert_eq!(vcs.line_endings().unwrap(), Vec::<LineEnding>::new());
}

/// Proves every read row of "Setup reads with a program that cannot start".
///
/// Covers: rust-vcs/setup-reads-with-a-program-that-cannot-start
#[test]
fn setup_reads_with_a_program_that_cannot_start() {
    let scratch = Scratch::new("setup_reads_missing_program");
    let vcs = GitVcs::new(scratch.path()).with_program("osq-missing-git");

    assert_spawn(
        vcs.version(),
        "osq-missing-git -c core.quotepath=false --version",
    );
    assert_spawn(
        vcs.hook_names(),
        "osq-missing-git -c core.quotepath=false rev-parse --git-path hooks",
    );
    assert_spawn(
        vcs.line_endings(),
        "osq-missing-git -c core.quotepath=false ls-files --eol -z",
    );
}
