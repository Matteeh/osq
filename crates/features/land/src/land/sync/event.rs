//! Appending the sync's `synced` event.

use std::fs::{self, OpenOptions};
use std::io::Write as _;
use std::path::Path;
use std::time::Instant;

use osq_core::event::{Envelope, Event, SyncedData, event_line};
use osq_kernel_vcs::{GitVcs, Vcs};

use super::{super::time, stop::Stop};

/// Appends and stages the `synced` event, then gives nothing.
///
/// # Errors
///
/// Returns a `sync_failed` stop when the event or its staging fails.
///
/// Implements: rust-land/land-sync
pub(crate) fn synced(
    vcs: &GitVcs,
    path: &Path,
    folder: &str,
    default_branch: &str,
    commits: u64,
    start: Instant,
) -> Result<(), Stop> {
    let duration = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX);
    let data = SyncedData {
        default_branch: default_branch.to_owned(),
        commits,
        duration: serde_json::Number::from(duration),
    };
    let envelope = Envelope {
        timestamp: time::format_utc(time::now_ms()),
        event: Event::Synced(data),
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| Stop::failed(error.to_string()))?;
    }
    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(path)
        .map_err(|error| Stop::failed(error.to_string()))?;
    let line = format!("{}\n", event_line(&envelope));
    file.write_all(line.as_bytes())
        .map_err(|error| Stop::failed(error.to_string()))?;
    let relative = format!("openspec/changes/archive/{folder}/.run/events/change.jsonl");
    vcs.stage(&[relative.as_str()])
        .map_err(|error| Stop::vcs(&error))
}
