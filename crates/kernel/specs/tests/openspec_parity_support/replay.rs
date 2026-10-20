//! The landing order of this repository's archive for the parity tests.

use super::trees::folders;
use std::path::{Path, PathBuf};

/// The archived change folders in the landing order of rust-specs "Archive
/// replay": the folders with no `archived` timestamp first, in byte order of
/// their names, then the others by the timestamp of their last `archived`
/// event and then by name.
#[must_use]
pub fn archived_landing_order(archive: &Path) -> Vec<PathBuf> {
    let mut landed: Vec<(Option<String>, PathBuf)> = folders(archive)
        .into_iter()
        .map(|path| (last_archived_timestamp(&path), path))
        .collect();
    landed.sort_by(|(left_stamp, left), (right_stamp, right)| {
        left_stamp
            .cmp(right_stamp)
            .then_with(|| left.file_name().cmp(&right.file_name()))
    });
    landed.into_iter().map(|(_, path)| path).collect()
}

/// The last `archived` timestamp one change folder recorded, when it has one.
fn last_archived_timestamp(change: &Path) -> Option<String> {
    let text = std::fs::read_to_string(change.join(".run/events/change.jsonl")).ok()?;
    let mut last = None;
    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        if value.get("type").and_then(|kind| kind.as_str()) != Some("archived") {
            continue;
        }
        if let Some(stamp) = value.get("timestamp").and_then(|stamp| stamp.as_str()) {
            last = Some(stamp.to_string());
        }
    }
    last
}
