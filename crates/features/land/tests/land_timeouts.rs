//! Proves a slow git status stops land at the configured limit.

mod support;

use std::time::{Duration, Instant};

use osq_core::FeatureError;
use support::{ChangeTree, LandRepo};

/// The root's `osq.toml`: the support's vcs block and a one second git limit.
const OSQ_TOML: &str = "\
[vcs]
enabled = true
author = \"osq <osq@example.invalid>\"
[timeouts]
gitSeconds = 1
";

/// The message the slow status gives, naming the command and the limit.
const TIMED_OUT: &str =
    "git -c core.quotepath=false status --porcelain=v1 -z --untracked-files=all timed out after 1s";

/// A land repository holding the fixture change, the one second git limit and
/// the per-worktree config the slow row needs.
fn setup(name: &str) -> (LandRepo, ChangeTree) {
    let repo = LandRepo::new(name);
    let change = repo.add_fixture_change();
    repo.write(repo.checkout(), "osq.toml", OSQ_TOML);
    repo.git(
        repo.checkout(),
        &["config", "extensions.worktreeConfig", "true"],
    );
    (repo, change)
}

/// Runs `land 1` and proves it stopped with the timeout message, within five
/// seconds and with the checkout's HEAD unchanged.
fn assert_stops(repo: &LandRepo, label: &str) {
    let before = repo.head(repo.checkout());
    let started = Instant::now();
    let error = repo.run("1").expect_err(label);
    let elapsed = started.elapsed();
    assert!(
        elapsed < Duration::from_secs(5),
        "{label}: land took {elapsed:?}"
    );
    match &error {
        FeatureError::Failed {
            command, message, ..
        } => {
            assert_eq!(command, "land", "{label}: command");
            assert_eq!(message, TIMED_OUT, "{label}: message");
        }
        other => panic!("{label}: expected a Failed error, got {other:?}"),
    }
    assert_eq!(
        repo.head(repo.checkout()),
        before,
        "{label}: the checkout's HEAD is unchanged"
    );
}

/// Proves the change worktree's slow status stops land at the configured
/// limit.
///
/// Covers: rust-land/a-slow-git-status-stops-land-at-the-configured-limit
#[test]
fn slow_worktree_status_stops_land() {
    let (repo, change) = setup("timeout_worktree");
    repo.git(
        &change.path,
        &["config", "--worktree", "core.fsmonitor", "sleep 30"],
    );
    assert_stops(&repo, "the change's worktree");
}

/// Proves the checkout's slow status stops land at the configured limit when
/// the fast-forward reads it.
///
/// Covers: rust-land/a-slow-git-status-stops-land-at-the-configured-limit
#[test]
fn slow_checkout_status_stops_land() {
    let (repo, _change) = setup("timeout_checkout");
    repo.git(
        repo.checkout(),
        &["config", "--worktree", "core.fsmonitor", "sleep 30"],
    );
    assert_stops(&repo, "the checkout");
}
