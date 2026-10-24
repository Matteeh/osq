//! Recording a task that died: its marker and its `dead` event.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use osq_core::FeatureError;
use osq_core::event::{DeadData, DeadReason, Envelope, Event, RegressionReason, event_line};
use osq_kernel_config::Config;

use super::{commit, halt, text, time};

/// What a death needs to be committed in the change's osq worktree.
pub(crate) struct Death<'a> {
    /// The root of the tree the change lives in.
    pub(crate) root: &'a Path,
    /// The config with the author and the git timeouts.
    pub(crate) config: &'a Config,
    /// Whether the change lives in a worktree rather than the checkout.
    pub(crate) commits: bool,
}

/// Writes the dead marker and appends the task's `dead` event.
///
/// # Errors
///
/// Returns a `Failed` error with the command `run` when the marker or the
/// event file cannot be created or written.
///
/// Implements: rust-run/dead-record
pub(crate) fn record(
    folder: &Path,
    task: &str,
    reason: DeadReason,
    marker: &str,
) -> Result<(), FeatureError> {
    write_marker(folder, task, marker)?;
    append_event(folder, task, reason)
}

/// Records a task's death and returns the failed ending it leaves.
///
/// In an osq worktree it also saves the agent's patch, discards its files
/// outside the change folder and commits the dead records.
///
/// # Errors
///
/// Returns the failure from `record`, the ending that names the death, or the
/// ending that adds a failed dead commit.
///
/// Implements: rust-run/dead-record
/// Implements: rust-run/dead-task-commit
pub(crate) fn kill<T>(
    folder: &Path,
    name: &str,
    task: &str,
    reason: DeadReason,
    marker: &str,
    death: &Death<'_>,
) -> Result<T, FeatureError> {
    record(folder, task, reason, marker)?;
    if death.commits
        && let Err(error) = commit::dead(death.root, folder, task, reason.as_str(), death.config)
    {
        halt::record(folder, RegressionReason::CommitFailed, &error, death.config)?;
        return Err(failed_text(text::commit_failed_dead(
            task,
            name,
            reason.as_str(),
            error,
        )));
    }
    Err(failed_text(text::died(task, name, reason.as_str())))
}

/// Writes `.run/dead/<task>.md` with `marker`.
fn write_marker(folder: &Path, task: &str, marker: &str) -> Result<(), FeatureError> {
    let dir = folder.join(".run").join("dead");
    fs::create_dir_all(&dir).map_err(|error| failed(&dir, &error))?;
    let path = dir.join(format!("{task}.md"));
    fs::write(&path, marker).map_err(|error| failed(&path, &error))
}

/// Appends one `dead` event to `.run/events/<task>.jsonl`.
fn append_event(folder: &Path, task: &str, reason: DeadReason) -> Result<(), FeatureError> {
    let dir = folder.join(".run").join("events");
    fs::create_dir_all(&dir).map_err(|error| failed(&dir, &error))?;
    let path = dir.join(format!("{task}.jsonl"));
    let envelope = Envelope {
        timestamp: time::format_utc(time::now_ms()),
        event: Event::Dead(DeadData {
            task: task.to_owned(),
            reason,
        }),
    };
    let line = format!("{}\n", event_line(&envelope));
    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(&path)
        .map_err(|error| failed(&path, &error))?;
    file.write_all(line.as_bytes())
        .map_err(|error| failed(&path, &error))
}

/// Builds the failed error for a path that could not be written.
fn failed(path: &Path, error: &std::io::Error) -> FeatureError {
    FeatureError::failed("run", format!("cannot write {}: {error}", path.display()))
}

/// Builds the failed error that names a death.
fn failed_text(message: String) -> FeatureError {
    FeatureError::failed("run", message)
}
