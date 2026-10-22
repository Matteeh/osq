//! Everything `run` refuses before it writes anything.

use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::{Config, Harness, load_config};
use osq_kernel_storage::{ChangeEntry, list_changes};
use osq_kernel_vcs::{GitVcs, Vcs};

use super::{find, text};

/// Checks every refusal that does not need the lock, in the requirement's order.
///
/// # Errors
///
/// Returns a `Failed` error with the command `run` for a config error, an id
/// that names no active change, a missing task file, a non-pi executor
/// harness, a root outside git, and a task that is already done, dead or
/// regressed.
///
/// Implements: rust-run/run-refusals
pub(crate) fn check(
    root: &Path,
    id: &str,
    task: &str,
) -> Result<(ChangeEntry, Config), FeatureError> {
    let config = load_config(root).map_err(|error| failed(error.to_string()))?;
    let changes = list_changes(root);
    let entry = find::find_change(&changes, id)
        .ok_or_else(|| failed(text::not_found(id, &root.join("openspec").join("changes"))))?;
    if !task_file(entry, task).is_file() {
        return Err(failed(text::missing_task(task, &entry.folder)));
    }
    if config.executor.harness != Harness::Pi {
        return Err(failed(text::unsupported_harness(
            config.executor.harness.as_str(),
        )));
    }
    let repository = GitVcs::new(root)
        .root()
        .map_err(|error| failed(error.to_string()))?;
    let expected = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    if repository.as_deref() != Some(expected.as_path()) {
        return Err(failed(text::no_git(root)));
    }
    check_markers(entry, task)?;
    Ok((entry.clone(), config))
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
