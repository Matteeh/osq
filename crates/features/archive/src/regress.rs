//! The `commit_failed` record a failed worktree archive commit leaves behind.

use std::fs;
use std::io::{self, Write as _};
use std::path::Path;

use osq_core::event::{Envelope, Event, RegressedData, RegressionReason, event_line};
use osq_kernel_vcs::VcsError;

use crate::time;

/// The detail a failed archive commit records: git's output, or the display
/// of every other version control error.
///
/// Implements: rust-archive/worktree-archive
pub(crate) fn detail(error: &VcsError) -> String {
    match error {
        VcsError::Failed { output, .. } => output.clone(),
        other => other.to_string(),
    }
}

/// Writes `.run/regressed/change.md` and appends the `regressed` event.
///
/// # Errors
///
/// Returns the operating system's error for a folder, marker, open or append
/// that fails.
///
/// Implements: rust-archive/worktree-archive
pub(crate) fn record(archived: &Path, detail: &str) -> io::Result<()> {
    let run = archived.join(".run");
    write_marker(&run.join("regressed").join("change.md"), detail)?;
    append_event(&run.join("events").join("change.jsonl"), detail)
}

/// Writes the marker with `commit_failed` and the detail.
///
/// Implements: rust-archive/worktree-archive
fn write_marker(path: &Path, detail: &str) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, format!("---\nreason: commit_failed\n---\n{detail}\n"))
}

/// Appends one `regressed` event carrying the detail.
///
/// Implements: rust-archive/worktree-archive
fn append_event(path: &Path, detail: &str) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let envelope = Envelope {
        timestamp: time::format_utc(time::now_ms()),
        event: Event::Regressed(data(detail)),
    };
    let line = format!("{}\n", event_line(&envelope));
    let mut file = fs::OpenOptions::new()
        .append(true)
        .create(true)
        .open(path)?;
    file.write_all(line.as_bytes())
}

/// The `regressed` payload for a failed archive commit.
///
/// Implements: rust-archive/worktree-archive
fn data(detail: &str) -> RegressedData {
    RegressedData {
        task: Some("change".to_owned()),
        exit_code: None,
        duration: None,
        command: None,
        differing_paths: None,
        missing_paths: None,
        reason: Some(RegressionReason::CommitFailed),
        attribution: None,
        recorded_hash: None,
        current_hash: None,
        recorded_resolver: None,
        current_resolver: None,
        output: Some(detail.to_owned()),
        timed_out: None,
        verification_passed: None,
    }
}
