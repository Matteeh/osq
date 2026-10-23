//! Appending the typed events a run writes to `.run/events`.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use osq_core::FeatureError;
use osq_core::event::{DoneData, Envelope, Event, ScopeViolationData, VerifyRanData, event_line};
use osq_kernel_config::Config;
use osq_kernel_harnesses::VerifyOutcome;

use super::{output, pre_spawn, time};

/// The pre-spawn fields a `verify_ran` event carries, empty for a run's own.
#[derive(Default)]
pub(crate) struct VerifyMeta {
    /// The declared start phase.
    phase: Option<String>,
    /// The expected start colour.
    expected: Option<String>,
    /// Whether the start colour mismatched.
    mismatch: Option<bool>,
    /// Paths the command named that did not exist.
    missing_paths: Option<Vec<String>>,
}

impl VerifyMeta {
    /// Builds the pre-spawn fields from the run's outcome.
    ///
    /// Implements: rust-run/pre-spawn-verify
    pub(crate) fn pre_spawn(start: &pre_spawn::PreSpawn<'_>, outcome: &VerifyOutcome) -> Self {
        Self {
            phase: Some("pre_spawn".to_owned()),
            expected: Some(pre_spawn::start_name(start.expected).to_owned()),
            mismatch: Some(pre_spawn::mismatch(start.expected, outcome, start.missing)),
            missing_paths: (!start.missing.is_empty()).then(|| start.missing.to_vec()),
        }
    }
}

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
/// Implements: rust-run/worktree-halt
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

/// One verify event's stream and run fields.
pub(crate) struct VerifyEvent<'a> {
    /// The event stream's file name.
    pub(crate) stream: &'a str,
    /// The task for a task stream, or none for `change.jsonl`.
    pub(crate) task: Option<&'a str>,
    /// The command that ran.
    pub(crate) command: &'a str,
    /// The run's outcome.
    pub(crate) outcome: &'a VerifyOutcome,
    /// The log path.
    pub(crate) log: &'a str,
    /// The config with the tail limits.
    pub(crate) config: &'a Config,
    /// The pre-spawn fields, or none for a run's own verify.
    pub(crate) meta: &'a VerifyMeta,
}

/// Appends one `verify_ran` event for a finished verify command.
///
/// # Errors
///
/// Returns the write error `append` gives.
///
/// Implements: rust-run/run-verdict
pub(crate) fn verify_ran(folder: &Path, event: &VerifyEvent<'_>) -> Result<(), FeatureError> {
    let tail = output::tail_verify_output(
        &event.outcome.output,
        event.config.limits.marker_output_lines,
        event.config.limits.marker_line_chars,
    );
    let data = VerifyRanData {
        command: event.command.to_owned(),
        exit_code: Some(i64::from(event.outcome.exit_code)),
        duration: None,
        log: Some(event.log.to_owned()),
        verify_command: None,
        output: (!tail.is_empty()).then_some(tail),
        phase: event.meta.phase.clone(),
        expected: event.meta.expected.clone(),
        mismatch: event.meta.mismatch,
        missing_paths: event.meta.missing_paths.clone(),
        task: event.task.map(str::to_owned),
    };
    append(folder, event.stream, Event::VerifyRan(data))
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
