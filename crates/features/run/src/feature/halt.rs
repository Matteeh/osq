//! Recording a change halt in its osq worktree: its marker, its event and the
//! failed ending that names it.

use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_core::event::{Event, RegressedData, RegressionReason};
use osq_kernel_config::Config;

use super::{events, output, text};

/// Writes `.run/regressed/change.md` and appends the `change` stream's
/// `regressed` event, both with the tail `output::tail_verify_output` keeps.
///
/// # Errors
///
/// Returns a `Failed` error with the command `run` when the marker or the event
/// cannot be written.
///
/// Implements: rust-run/worktree-halt
pub(crate) fn record(
    folder: &Path,
    reason: RegressionReason,
    detail: &str,
    config: &Config,
) -> Result<(), FeatureError> {
    let kept = output::tail_verify_output(
        detail,
        config.limits.marker_output_lines,
        config.limits.marker_line_chars,
    );
    write_marker(folder, reason, &kept)?;
    append_event(folder, reason, &kept)
}

/// The failed ending a worktree check gives a halt it raised itself.
///
/// Implements: rust-run/worktree-halt
pub(crate) fn failure(folder: &str, reason: RegressionReason) -> FeatureError {
    FeatureError::failed("run", text::halted(folder, reason.as_str()))
}

/// Writes the change's regressed marker with `reason` and the kept `detail`.
fn write_marker(folder: &Path, reason: RegressionReason, detail: &str) -> Result<(), FeatureError> {
    let dir = folder.join(".run").join("regressed");
    fs::create_dir_all(&dir).map_err(|error| failed(&dir, &error))?;
    let path = dir.join("change.md");
    let content = format!("---\nreason: {}\n---\n{detail}\n", reason.as_str());
    fs::write(&path, content).map_err(|error| failed(&path, &error))
}

/// Appends the halt event to the change's `.run/events/change.jsonl`.
fn append_event(folder: &Path, reason: RegressionReason, detail: &str) -> Result<(), FeatureError> {
    events::append(
        folder,
        "change.jsonl",
        Event::Regressed(RegressedData {
            task: Some("change".to_owned()),
            exit_code: None,
            duration: None,
            command: None,
            differing_paths: None,
            missing_paths: None,
            reason: Some(reason),
            attribution: None,
            recorded_hash: None,
            current_hash: None,
            recorded_resolver: None,
            current_resolver: None,
            output: Some(detail.to_owned()),
            timed_out: None,
            verification_passed: None,
        }),
    )
}

/// Builds the failed error for a halt path that could not be written.
fn failed(path: &Path, error: &std::io::Error) -> FeatureError {
    FeatureError::failed("run", format!("cannot write {}: {error}", path.display()))
}
