//! The done marker, done event and ticked checkbox of a passing task.

use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_storage::ChangeEntry;

use super::{events, time};
use crate::tick::tick_task_checkbox;

/// Writes `.run/done/<task>`, appends its `done` event and ticks `tasks.md`.
///
/// # Errors
///
/// Returns a `Failed` error when a marker, event or `tasks.md` write fails.
///
/// Implements: rust-run/done-record
pub(crate) fn record(entry: &ChangeEntry, task: &str) -> Result<(), FeatureError> {
    let folder = entry.path.join(".run").join("done");
    fs::create_dir_all(&folder).map_err(|error| failed(&folder, &error))?;
    let path = folder.join(task);
    let stamp = format!("{}\n", time::format_utc(time::now_ms()));
    fs::write(&path, stamp).map_err(|error| failed(&path, &error))?;
    events::done(&entry.path, task)?;
    tick(&entry.path, task)
}

/// Ticks the task's checkbox in the change folder's `tasks.md`.
fn tick(entry: &Path, task: &str) -> Result<(), FeatureError> {
    let path = entry.join("tasks.md");
    let Ok(content) = fs::read_to_string(&path) else {
        return Ok(());
    };
    let updated = tick_task_checkbox(&content, task);
    fs::write(&path, updated).map_err(|error| failed(&path, &error))
}

/// Builds the failed error for a done record that could not be written.
fn failed(path: &Path, error: &std::io::Error) -> FeatureError {
    FeatureError::failed("run", format!("cannot write {}: {error}", path.display()))
}
