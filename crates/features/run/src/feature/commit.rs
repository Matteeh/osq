//! Committing a verified or dead task in its change's worktree.

use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_specs::{TaskFile, read_task_file};
use osq_kernel_storage::ChangeEntry;
use osq_kernel_vcs::{GitVcs, Vcs};

use super::{message, pause, scope, text};

/// Commits a verified task with the paths its scope audit allows, its untracked
/// test files and its records.
///
/// # Errors
///
/// Returns a `Failed` error with the command `run` when git status or the
/// commit fails, leaving every file as it was.
///
/// Implements: rust-run/verified-task-commit
pub(crate) fn verified(
    root: &Path,
    entry: &ChangeEntry,
    task: &str,
    task_file: &TaskFile,
    config: &Config,
) -> Result<(), FeatureError> {
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let status = vcs.status().map_err(|error| failed(error.to_string()))?;
    let paths = scope::commit_paths(root, entry, task, task_file, &status);
    let refs: Vec<&str> = paths.iter().map(String::as_str).collect();
    let subject = format!(
        "osq: {} task {task} verified",
        message::change_id(&entry.folder)
    );
    let elapsed = message::elapsed_seconds(&entry.path, task);
    let outcome = format!("[ok] task {task} verified (elapsed: {elapsed}s)");
    let trailers = message::read_trailers(&entry.path, task);
    let text = message::format(&subject, &task_file.title, &outcome, &trailers);
    let author = config.vcs.author.as_deref().unwrap_or_default();
    vcs.commit(&refs, &text, author)
        .map(|_| ())
        .map_err(|error| failed(text::commit_failed(task, &entry.folder, &error)))
}

/// Records a dead task in its change's worktree: saves its patch, discards the
/// agent's files outside the change folder and commits the dead records.
///
/// # Errors
///
/// Returns the display of the patch, discard or commit failure, leaving the
/// files as that step left them.
///
/// Implements: rust-run/dead-task-commit
pub(crate) fn dead(
    root: &Path,
    folder: &Path,
    task: &str,
    reason: &str,
    config: &Config,
) -> Result<(), String> {
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let patch = vcs.patch(None).map_err(|error| error.to_string())?;
    let dir = folder.join(".run").join("dead");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    fs::write(dir.join(format!("{task}.patch")), patch).map_err(|error| error.to_string())?;
    let status = vcs.status().map_err(|error| error.to_string())?;
    let outside = pause::outside_change(root, folder, &status);
    let discard: Vec<&str> = outside.iter().map(String::as_str).collect();
    vcs.discard(&discard).map_err(|error| error.to_string())?;

    let change = scope::relative(root, folder);
    let name = folder
        .file_name()
        .map_or_else(String::new, |name| name.to_string_lossy().into_owned());
    let refs: Vec<String> = dead_records(&change, task)
        .into_iter()
        .filter(|record| root.join(record).exists())
        .collect();
    let paths: Vec<&str> = refs.iter().map(String::as_str).collect();
    let task_file = read_task_file(&folder.join("tasks").join(format!("{task}.md")))
        .map_err(|error| error.to_string())?;
    let subject = format!(
        "osq: {} task {task} dead, reason {reason}",
        message::change_id(&name)
    );
    let elapsed = message::elapsed_seconds(folder, task);
    let outcome = format!("[dead] task {task} dead (reason: {reason}, elapsed: {elapsed}s)");
    let trailers = message::read_trailers(folder, task);
    let text = message::format(&subject, &task_file.title, &outcome, &trailers);
    let author = config.vcs.author.as_deref().unwrap_or_default();
    vcs.commit(&paths, &text, author)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

/// The three records a dead task commits when they exist.
fn dead_records(change: &str, task: &str) -> [String; 3] {
    [
        format!("{change}/.run/dead/{task}.md"),
        format!("{change}/.run/dead/{task}.patch"),
        format!("{change}/.run/events/{task}.jsonl"),
    ]
}

/// Builds the failed error for a commit step.
fn failed(message: String) -> FeatureError {
    FeatureError::failed("run", message)
}
