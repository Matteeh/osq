//! Appending the typed events a run writes to `.run/events`.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use osq_core::FeatureError;
use osq_core::event::{DoneData, Envelope, Event, ScopeViolationData, VerifyRanData, event_line};
use osq_kernel_harnesses::VerifyOutcome;

use super::time;

/// Appends one event to `.run/events/<stream>` and creates the folder when needed.
///
/// # Errors
///
/// Returns a `Failed` error with the command `run` when the event folder or
/// file cannot be created or written.
///
/// Implements: rust-run/executor-start
/// Implements: rust-run/run-verdict
/// Implements: rust-run/done-record
pub(crate) fn append(folder: &Path, stream: &str, event: Event) -> Result<(), FeatureError> {
    let dir = folder.join(".run").join("events");
    fs::create_dir_all(&dir).map_err(|error| failed(&dir, &error))?;
    let path = dir.join(stream);
    let envelope = Envelope {
        timestamp: time::format_utc(time::now_ms()),
        event,
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

/// Appends one `verify_ran` event for a finished verify command.
///
/// # Errors
///
/// Returns the write error `append` gives.
///
/// Implements: rust-run/run-verdict
pub(crate) fn verify_ran(
    folder: &Path,
    stream: &str,
    task: Option<&str>,
    command: &str,
    outcome: &VerifyOutcome,
) -> Result<(), FeatureError> {
    let data = VerifyRanData {
        command: command.to_owned(),
        exit_code: Some(i64::from(outcome.exit_code)),
        duration: None,
        log: None,
        verify_command: None,
        output: Some(outcome.output.clone()),
        phase: None,
        expected: None,
        mismatch: None,
        missing_paths: None,
        task: task.map(str::to_owned),
    };
    append(folder, stream, Event::VerifyRan(data))
}

/// Appends the `scope_violation` event for the paths outside the task's scope.
///
/// # Errors
///
/// Returns the write error `append` gives.
///
/// Implements: rust-run/run-scope-audit
pub(crate) fn scope_violation(
    folder: &Path,
    task: &str,
    files: Vec<String>,
) -> Result<(), FeatureError> {
    append(
        folder,
        &format!("{task}.jsonl"),
        Event::ScopeViolation(ScopeViolationData { files }),
    )
}

/// Appends the `done` event for a task whose verdict passed.
///
/// # Errors
///
/// Returns the write error `append` gives.
///
/// Implements: rust-run/done-record
pub(crate) fn done(folder: &Path, task: &str) -> Result<(), FeatureError> {
    append(
        folder,
        &format!("{task}.jsonl"),
        Event::Done(DoneData {
            task: task.to_owned(),
        }),
    )
}

/// Builds the failed error for an event path that could not be written.
fn failed(path: &Path, error: &std::io::Error) -> FeatureError {
    FeatureError::failed("run", format!("cannot write {}: {error}", path.display()))
}
