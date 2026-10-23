//! Everything `run` refuses before it writes anything.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::{Config, Harness, load_config};
use osq_kernel_storage::{ChangeEntry, list_changes};
use osq_kernel_vcs::{GitVcs, Vcs};

use super::{catch_up, checks, find, text, worktree};

/// The change, the config and the root of the tree the change lives in.
pub(crate) type Checked = (ChangeEntry, Config, PathBuf);

/// Checks every refusal that does not need the lock, in the requirement's order.
///
/// # Errors
///
/// Returns a `Failed` error with the command `run` for a config error, an id
/// that names no active change, a missing task file, a non-pi executor
/// harness, a root outside git, a failed worktree check, and a task that is
/// already done, dead or regressed.
///
/// Implements: rust-run/run-refusals
/// Implements: rust-run/worktree-run
pub(crate) fn check(root: &Path, id: &str, task: &str) -> Result<Checked, FeatureError> {
    let config = load_config(root).map_err(|error| failed(error.to_string()))?;
    let found = find_change(root, &config, id)?;
    let (entry, tree_root) = (found.entry, found.root);
    if !task_file(&entry, task).is_file() {
        return Err(failed(text::missing_task(task, &entry.folder)));
    }
    if config.executor.harness != Harness::Pi {
        return Err(failed(text::unsupported_harness(
            config.executor.harness.as_str(),
        )));
    }
    let repository = GitVcs::new(&tree_root)
        .root()
        .map_err(|error| failed(error.to_string()))?;
    let expected = fs::canonicalize(&tree_root).unwrap_or_else(|_| tree_root.clone());
    if repository.as_deref() != Some(expected.as_path()) {
        return Err(failed(text::no_git(&tree_root)));
    }
    if worktree::is_worktree(root, &tree_root) {
        catch_up::run(&tree_root, &entry, &config)?;
        checks::run(&tree_root, &entry, &config)?;
    }
    check_markers(&entry, task)?;
    Ok((entry, config, tree_root))
}

/// Finds the change, in its worktree when git is on and in the root otherwise.
///
/// # Errors
///
/// Returns a `Failed` error with the display of the first git error, and for
/// an id no active change matches.
///
/// Implements: rust-run/run-refusals
/// Implements: rust-run/worktree-run
fn find_change(root: &Path, config: &Config, id: &str) -> Result<worktree::Found, FeatureError> {
    if worktree::git_on(root, config)? {
        return worktree::find(root, config, id);
    }
    let changes = list_changes(root);
    find::find_change(&changes, id)
        .cloned()
        .map(|entry| worktree::Found {
            entry,
            root: root.to_path_buf(),
        })
        .ok_or_else(|| failed(text::not_found(id, &root.join("openspec").join("changes"))))
}

/// The `tasks/<task>.md` path of one change folder.
fn task_file(entry: &ChangeEntry, task: &str) -> std::path::PathBuf {
    entry.path.join("tasks").join(format!("{task}.md"))
}

/// Refuses a task that already ended as done, dead or regressed.
///
/// Implements: rust-run/run-refusals
fn check_markers(entry: &ChangeEntry, task: &str) -> Result<(), FeatureError> {
    let run = entry.path.join(".run");
    let markers = [
        (run.join("done").join(task), "done"),
        (run.join("dead").join(format!("{task}.md")), "dead"),
        (
            run.join("regressed").join(format!("{task}.md")),
            "regressed",
        ),
    ];
    for (path, kind) in markers {
        if path.exists() {
            return Err(failed(text::marker_exists(task, &entry.folder, kind)));
        }
    }
    Ok(())
}

/// Builds the failed error for a refusal.
fn failed(message: String) -> FeatureError {
    FeatureError::failed("run", message)
}
