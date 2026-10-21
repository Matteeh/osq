//! Proves the default limits and the commands that run out of time or finish
//! in time.

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use osq_kernel_config::Timeouts;
use osq_kernel_vcs::{GitVcs, Vcs, VcsError};

/// The fake git program: it sleeps when its command is the row's slow one.
const FAKE_GIT: &str =
    "#!/bin/sh\nif [ \"$3\" = \"$OSQ_FAKE_SLOW\" ]; then exec sleep 30; fi\nexit 0\n";

/// Serializes the tests that write and start fake git scripts.
static SPAWN_LOCK: Mutex<()> = Mutex::new(());

/// One row's call under test, with no result value kept.
type Call = fn(&GitVcs) -> Result<(), VcsError>;

/// Takes the lock that keeps one test writing and starting scripts at a time.
fn spawn_lock() -> MutexGuard<'static, ()> {
    SPAWN_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// The limits the timeout rows use.
fn limits() -> Timeouts {
    Timeouts {
        git: Duration::from_millis(200),
        git_commit: Duration::from_millis(400),
        ..Timeouts::default()
    }
}

/// Writes the fake git script `name` into its own folder, giving the folder and
/// the script's path.
fn fake_git(name: &str) -> (PathBuf, PathBuf) {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let script = root.join("git");
    fs::write(&script, FAKE_GIT).unwrap();
    let mut permissions = fs::metadata(&script).unwrap().permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&script, permissions).unwrap();
    (root, script)
}

/// A `GitVcs` on the fake git script `name`, slow on `slow`, giving it and the
/// script's path.
fn slow_vcs(name: &str, slow: &str) -> (GitVcs, PathBuf) {
    let (root, script) = fake_git(name);
    let vcs = GitVcs::new(&root)
        .with_program(script.to_str().unwrap())
        .with_env("OSQ_FAKE_SLOW", slow)
        .with_timeouts(&limits());
    (vcs, script)
}

/// Asserts `result` is a timeout naming `fake`, `args` and `limit`, reached
/// within ten seconds.
fn assert_timed_out(
    label: &str,
    result: Result<(), VcsError>,
    fake: &Path,
    args: &str,
    limit: Duration,
    elapsed: Duration,
) {
    let error = result.expect_err("the slow command must fail");
    let VcsError::TimedOut {
        command,
        limit: actual,
    } = &error
    else {
        panic!("{label}: expected VcsError::TimedOut, got {error}");
    };
    let expected = format!("{} -c core.quotepath=false {args}", fake.display());
    assert_eq!(command, &expected, "{label}");
    assert_eq!(*actual, limit, "{label}");
    assert_eq!(
        error.to_string(),
        format!("{expected} timed out after {limit:?}"),
        "{label}"
    );
    assert!(
        std::error::Error::source(&error).is_none(),
        "{label}: a timeout has no source"
    );
    assert!(
        elapsed < Duration::from_secs(10),
        "{label}: took {elapsed:?}"
    );
}

/// Proves `new` uses the default limits and `with_timeouts` replaces them.
///
/// Covers: rust-vcs/default-timeouts
#[test]
fn default_timeouts() {
    assert_eq!(
        GitVcs::new("/repo"),
        GitVcs::new("/repo").with_timeouts(&Timeouts::default())
    );
    assert_ne!(
        GitVcs::new("/repo"),
        GitVcs::new("/repo").with_timeouts(&limits())
    );
}

/// One row's label, slow command, expected arguments, limit and call.
type Row = (&'static str, &'static str, &'static str, Duration, Call);

/// The read rows of "Commands that run out of time".
fn read_rows() -> [Row; 6] {
    [
        (
            "root",
            "rev-parse",
            "rev-parse --show-toplevel",
            Duration::from_millis(200),
            |vcs| vcs.root().map(|_| ()),
        ),
        (
            "status",
            "status",
            "status --porcelain=v1 -z --untracked-files=all",
            Duration::from_millis(200),
            |vcs| vcs.status().map(|_| ()),
        ),
        (
            "show",
            "show",
            "show HEAD:a.txt",
            Duration::from_millis(200),
            |vcs| vcs.show("HEAD", "a.txt").map(|_| ()),
        ),
        (
            "is_ancestor",
            "merge-base",
            "merge-base --is-ancestor main side",
            Duration::from_millis(200),
            |vcs| vcs.is_ancestor("main", "side").map(|_| ()),
        ),
        (
            "count_commits",
            "rev-list",
            "rev-list --count main..side",
            Duration::from_millis(200),
            |vcs| vcs.count_commits("main", "side").map(|_| ()),
        ),
        (
            "worktree_list",
            "worktree",
            "worktree list --porcelain",
            Duration::from_millis(200),
            |vcs| vcs.worktree_list().map(|_| ()),
        ),
    ]
}

/// The write rows of "Commands that run out of time".
fn write_rows() -> [Row; 7] {
    [
        (
            "create_branch",
            "branch",
            "branch side main",
            Duration::from_millis(200),
            |vcs| vcs.create_branch("side", "main"),
        ),
        (
            "stage",
            "add",
            "add -A -- a.txt",
            Duration::from_millis(200),
            |vcs| vcs.stage(&["a.txt"]),
        ),
        (
            "commit",
            "commit",
            "commit --author=a <b> -F -",
            Duration::from_millis(400),
            |vcs| vcs.commit(&[], "m", "a <b>").map(|_| ()),
        ),
        (
            "commit_tree",
            "commit-tree",
            "commit-tree side^{tree} -p main -F -",
            Duration::from_millis(400),
            |vcs| {
                vcs.commit_tree("side", "main", "m", "a <b>", &[])
                    .map(|_| ())
            },
        ),
        (
            "merge",
            "merge",
            "merge --no-ff --no-commit side",
            Duration::from_millis(400),
            |vcs| vcs.merge("side", false).map(|_| ()),
        ),
        (
            "merge_abort",
            "merge",
            "merge --abort",
            Duration::from_millis(400),
            |vcs| vcs.merge_abort(),
        ),
        (
            "fast_forward",
            "merge",
            "merge --ff-only side",
            Duration::from_millis(400),
            |vcs| vcs.fast_forward("side").map(|_| ()),
        ),
    ]
}

/// Proves each row's call is killed at its row's limit and names the command and
/// the limit.
///
/// Covers: rust-vcs/commands-that-run-out-of-time
#[test]
fn commands_that_run_out_of_time() {
    let _guard = spawn_lock();
    for (label, slow, args, limit, call) in read_rows().into_iter().chain(write_rows()) {
        let (vcs, script) = slow_vcs(&format!("run_out_of_time_{label}"), slow);
        let started = Instant::now();
        let result = call(&vcs);
        let elapsed = started.elapsed();
        assert_timed_out(label, result, &script, args, limit, elapsed);
    }
}

/// Proves commands that finish inside their limit return their ordinary answers.
///
/// Covers: rust-vcs/commands-that-finish-in-time
#[test]
fn commands_that_finish_in_time() {
    let _guard = spawn_lock();
    let (vcs, _) = slow_vcs("finish_in_time", "none");
    assert_eq!(vcs.root().unwrap(), None);
    vcs.create_branch("side", "main").unwrap();
    vcs.merge_abort().unwrap();
}
