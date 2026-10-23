//! Helpers that build a scratch repository whose change lives in a worktree.
//!
//! Each test binary compiles this module on its own, so some helpers are
//! unused in a given binary even though another test uses them.
#![allow(dead_code)]

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use osq_core::event::{Event, StartedData, parse_event_line};
use osq_core::{FeatureError, Output};

use super::support;

/// A scratch repository whose change sits in its `osq/001-a` worktree.
pub struct Repo {
    /// The checkout `run` is invoked from.
    pub checkout: PathBuf,
    /// The root of the change's worktree.
    pub worktree: PathBuf,
}

/// Builds the repository "Worktree run finds its tree" builds.
///
/// The checkout holds the fixture and a config whose git is on; the worktree
/// holds the change, approved with its seal and committed, and the checkout
/// no longer holds the change.
pub fn build(name: &str) -> Repo {
    let checkout = support::scratch(&format!("worktree-{name}"));
    support::copy_tree(&support::fixture("run-project"), &checkout);
    support::remove(&checkout, ".gitignore");
    support::git(&checkout, &["init", "-q"]);
    support::git(&checkout, &["config", "user.name", "Osq Test"]);
    support::git(&checkout, &["config", "user.email", "osq@example.com"]);
    support::write(&checkout, ".git/info/exclude", "fake-pi-mode\n");
    support::git(&checkout, &["add", "-A"]);
    support::git(&checkout, &["commit", "-q", "-m", "fixture"]);
    support::write(&checkout, "osq.toml", config());
    support::git(&checkout, &["add", "-A"]);
    support::git(&checkout, &["commit", "-q", "-m", "config"]);
    let worktree = checkout.join("trees").join(support::FOLDER);
    let branch = format!("osq/{}", support::FOLDER);
    let path = worktree.to_str().expect("the worktree path is UTF-8");
    support::git(&checkout, &["worktree", "add", "-q", "-b", &branch, path]);
    support::write_seal(&worktree);
    support::git(&worktree, &["add", "-A"]);
    support::git(&worktree, &["commit", "-q", "-m", "approve"]);
    let change = format!("openspec/changes/{}", support::FOLDER);
    support::git(&checkout, &["rm", "-r", "-q", &change]);
    support::git(
        &checkout,
        &["commit", "-q", "-m", "move the change to its worktree"],
    );
    Repo { checkout, worktree }
}

/// Writes the fake pi's mode in the worktree, where the executor runs.
pub fn mode(repo: &Repo, mode: &str) {
    mode_in(&repo.worktree, mode);
}

/// Writes the fake pi's mode under `root`.
pub fn mode_in(root: &Path, mode: &str) {
    support::write(root, "fake-pi-mode", mode);
}

/// Copies the fixture's change into the checkout and approves it there.
pub fn change_into_checkout(repo: &Repo) {
    let from = support::fixture("run-project")
        .join("openspec/changes")
        .join(support::FOLDER);
    let to = repo.checkout.join("openspec/changes").join(support::FOLDER);
    support::copy_tree(&from, &to);
    support::write_seal(&repo.checkout);
}

/// Copies the fixture's change into the checkout's archive as `folder`.
pub fn archived_change(repo: &Repo, folder: &str) {
    let from = support::fixture("run-project")
        .join("openspec/changes")
        .join(support::FOLDER);
    let to = repo.checkout.join("openspec/changes/archive").join(folder);
    support::copy_tree(&from, &to);
}

/// Points the checkout's config at the fake pi that writes a file and then
/// reports a usage limit.
pub fn use_limit_pi(repo: &Repo) {
    support::write(&repo.checkout, "osq.toml", config_for(&limit_pi()));
}

/// Rewrites the checkout's config with git off, keeping the fake pi.
pub fn disable_git(repo: &Repo) {
    support::write(
        &repo.checkout,
        "osq.toml",
        format!(
            "[executor]\nharness = \"pi\"\n\n[pi]\nbin = \"{}\"\n",
            fake_pi()
        ),
    );
}

/// Runs `run` from the checkout with literal arguments.
///
/// # Errors
///
/// Returns the run feature's error for a refused or failed run.
pub fn run(repo: &Repo, args: &[&str]) -> Result<Output, FeatureError> {
    support::run(&repo.checkout, args)
}

/// Runs `run` from the worktree with literal arguments.
///
/// # Errors
///
/// Returns the run feature's error for a refused or failed run.
pub fn run_in_worktree(repo: &Repo, args: &[&str]) -> Result<Output, FeatureError> {
    support::run(&repo.worktree, args)
}

/// Runs `git` in `root` with the test's isolated settings.
pub fn git(root: &Path, args: &[&str]) -> String {
    support::git(root, args)
}

/// The commit whose branch `name` names.
pub fn tip(root: &Path, name: &str) -> String {
    git(root, &["rev-parse", &format!("refs/heads/{name}")])
        .trim()
        .to_owned()
}

/// One commit's message, exactly as stored.
pub fn message(root: &Path, commit: &str) -> String {
    let text = git(root, &["cat-file", "commit", commit]);
    let (_, message) = text.split_once("\n\n").expect("a commit has a message");
    message.to_owned()
}

/// The names and statuses a commit changes.
pub fn name_status(root: &Path, commit: &str) -> String {
    git(
        root,
        &["show", "--no-renames", "--name-status", "--format=", commit],
    )
}

/// Writes an executable `.git/hooks/pre-commit` that refuses every commit.
pub fn refuse_commits(repo: &Repo) {
    let hook = repo.checkout.join(".git/hooks/pre-commit");
    support::write(
        &repo.checkout,
        ".git/hooks/pre-commit",
        "#!/bin/sh\nprintf 'refused by hook\\n'\nexit 1\n",
    );
    let mut permissions = std::fs::metadata(&hook)
        .expect("the hook is written")
        .permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(hook, permissions).expect("the hook is executable");
}

/// The task's last `started` event in the worktree.
pub fn last_started(repo: &Repo) -> StartedData {
    let path = format!("openspec/changes/{}/.run/events/1.jsonl", support::FOLDER);
    support::read_text(&repo.worktree, &path)
        .lines()
        .filter_map(|line| parse_event_line(line.trim()).ok())
        .filter_map(|envelope| match envelope.event {
            Event::Started(data) => Some(data),
            _ => None,
        })
        .next_back()
        .expect("the task started")
}

/// The config that turns git on with the author the scenario names.
fn config() -> String {
    config_for(&fake_pi())
}

/// The config that turns git on, names `fake` as the executor's pi and gives
/// the author the scenario names.
fn config_for(fake: &str) -> String {
    format!(
        "[executor]\nharness = \"pi\"\nmodel = \"test-model\"\n\n[pi]\nbin = \"{fake}\"\n\n[vcs]\nenabled = true\nauthor = \"Osq Bot <bot@example.com>\"\n"
    )
}

/// The fake pi's executable path, made absolute for `pi.bin`.
fn fake_pi() -> String {
    support::fixture("fake-pi")
        .join("run.sh")
        .to_string_lossy()
        .into_owned()
}

/// The usage-limit fake pi's executable path, made absolute for `pi.bin`.
fn limit_pi() -> String {
    support::fixture("worktree-limit-pi")
        .join("run.sh")
        .to_string_lossy()
        .into_owned()
}
