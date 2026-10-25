//! The stop value and the record a land commits on the change's branch.

use std::fs;
use std::io::Write as _;
use std::path::Path;

use osq_core::event::{
    Envelope, Event, RegressedData, RegressionReason, SyncStopReason, event_line,
};
use osq_kernel_vcs::{GitVcs, Vcs, VcsError};

use super::{files, text, time};

/// Why a sync stopped, with the message the land fails with.
#[derive(Debug)]
pub(crate) struct Stop {
    /// The stop's reason.
    pub(crate) reason: SyncStopReason,
    /// The message the land fails with.
    pub(crate) message: String,
    /// The conflicted paths a conflict stop names, in merge order.
    pub(crate) conflicts: Vec<String>,
}

impl Stop {
    /// Builds a stop with one reason and message.
    ///
    /// Implements: rust-land/land-sync
    pub(crate) fn new(reason: SyncStopReason, message: impl Into<String>) -> Self {
        Self {
            reason,
            message: message.into(),
            conflicts: Vec::new(),
        }
    }

    /// Builds a stop that names the conflicted paths it blocks on.
    ///
    /// Implements: rust-land/land-sync
    pub(crate) fn conflicting(
        reason: SyncStopReason,
        message: impl Into<String>,
        conflicts: Vec<String>,
    ) -> Self {
        Self {
            reason,
            message: message.into(),
            conflicts,
        }
    }

    /// Builds a `sync_failed` stop from a git error.
    ///
    /// Implements: rust-land/land-sync
    pub(crate) fn vcs(error: &VcsError) -> Self {
        Self::new(SyncStopReason::SyncFailed, error.to_string())
    }

    /// Builds a `sync_failed` stop from a message.
    ///
    /// Implements: rust-land/land-sync
    pub(crate) fn failed(message: impl Into<String>) -> Self {
        Self::new(SyncStopReason::SyncFailed, message)
    }
}

/// Whether a stop with this reason is committed as the land stop record.
///
/// Implements: rust-land/land-stop-record
pub(crate) fn records(reason: SyncStopReason) -> bool {
    matches!(
        reason,
        SyncStopReason::SyncConflict
            | SyncStopReason::RequirementChanged
            | SyncStopReason::SyncVerifyRed
    )
}

/// Writes the marker and event, then commits exactly those two paths.
///
/// # Errors
///
/// Returns `osq could not record the stop: <display>` after putting both files
/// back and staging them when the commit fails.
///
/// Implements: rust-land/land-stop-record
pub(crate) fn record(
    vcs: &GitVcs,
    archived: &Path,
    folder: &str,
    author: &str,
    stop: &Stop,
) -> Result<(), String> {
    let marker_path = archived.join(".run/regressed/change.md");
    let events_path = archived.join(".run/events/change.jsonl");
    let marker_before = files::read(&marker_path);
    let events_before = files::read(&events_path);
    write_marker(&marker_path, folder, stop)?;
    append_event(&events_path, stop)?;
    let message = format!("osq: {} land stopped", text::change_id(folder));
    let base = format!("openspec/changes/archive/{folder}");
    let paths = [
        format!("{base}/.run/regressed/change.md"),
        format!("{base}/.run/events/change.jsonl"),
    ];
    let refs: Vec<&str> = paths.iter().map(String::as_str).collect();
    if let Err(error) = vcs.commit(&refs, &message, author) {
        let _ = files::restore(&marker_path, marker_before.as_deref());
        let _ = files::restore(&events_path, events_before.as_deref());
        let _ = vcs.stage(&refs);
        return Err(format!("osq could not record the stop: {error}"));
    }
    Ok(())
}

/// Writes `.run/regressed/change.md` for the stop.
///
/// Implements: rust-land/land-stop-record
fn write_marker(path: &Path, folder: &str, stop: &Stop) -> Result<(), String> {
    let text = format!(
        "---\nreason: {}\n---\n{}\n",
        reason_name(stop.reason),
        stop.message
    );
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("osq could not record the stop: {folder}: {error}"))?;
    }
    fs::write(path, text)
        .map_err(|error| format!("osq could not record the stop: {folder}: {error}"))
}

/// Appends the `regressed` event for the stop.
///
/// Implements: rust-land/land-stop-record
fn append_event(path: &Path, stop: &Stop) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "osq could not record the stop: {}: {error}",
                parent.display()
            )
        })?;
    }
    let envelope = Envelope {
        timestamp: time::format_utc(time::now_ms()),
        event: Event::Regressed(data(stop)),
    };
    let line = format!("{}\n", event_line(&envelope));
    let mut file = fs::OpenOptions::new()
        .append(true)
        .create(true)
        .open(path)
        .map_err(|error| format!("osq could not record the stop: {error}"))?;
    file.write_all(line.as_bytes())
        .map_err(|error| format!("osq could not record the stop: {error}"))
}

/// The `regressed` payload for the stop.
///
/// Implements: rust-land/land-stop-record
fn data(stop: &Stop) -> RegressedData {
    RegressedData {
        task: Some("change".to_owned()),
        exit_code: None,
        duration: None,
        command: None,
        differing_paths: None,
        missing_paths: None,
        reason: Some(regression(stop.reason)),
        attribution: None,
        recorded_hash: None,
        current_hash: None,
        recorded_resolver: None,
        current_resolver: None,
        output: Some(stop.message.clone()),
        timed_out: None,
        verification_passed: None,
    }
}

/// The regression reason that carries a sync stop reason.
///
/// Implements: rust-land/land-stop-record
fn regression(reason: SyncStopReason) -> RegressionReason {
    match reason {
        SyncStopReason::SyncConflict => RegressionReason::SyncConflict,
        SyncStopReason::RequirementChanged => RegressionReason::RequirementChanged,
        SyncStopReason::SyncVerifyRed => RegressionReason::SyncVerifyRed,
        SyncStopReason::SyncFailed => RegressionReason::SyncFailed,
    }
}

/// The stop reason's string as the marker writes it.
///
/// Implements: rust-land/land-stop-record
fn reason_name(reason: SyncStopReason) -> &'static str {
    reason.as_str()
}
