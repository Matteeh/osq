// The prompt's `## Manual edits` section.

use osq_kernel_storage::{ChangeSnapshot, Location, ManualEdit, timestamp_ms};

/// The line above the open manual edits.
const INTRO: &str = "Edits a human kept with osq manual after the last change that wrote these capabilities. When this change writes one of them, bring its spec in line with the edit.";

/// Builds the manual edits section's body, or none without an open edit.
///
/// Implements: rust-plan/manual-edits-section
pub(super) fn body(snapshots: &[ChangeSnapshot], edits: &[ManualEdit]) -> Option<String> {
    let archived: Vec<&ChangeSnapshot> = snapshots
        .iter()
        .filter(|snapshot| snapshot.location == Location::Archived)
        .collect();
    let mut lines = Vec::new();
    for record in edits {
        let open: Vec<&str> = record
            .capabilities
            .iter()
            .filter(|capability| capability_open(capability, &record.kept_at, &archived))
            .map(String::as_str)
            .collect();
        if open.is_empty() {
            continue;
        }
        lines.push(format!(
            "- {} {}: {} ({})",
            record.kept_at,
            open.join(", "),
            first_line(&record.comment),
            record.paths.join(", ")
        ));
    }
    if lines.is_empty() {
        return None;
    }
    Some(format!("{INTRO}\n{}", lines.join("\n")))
}

/// Whether no archived snapshot wrote the capability after the keep time.
fn capability_open(capability: &str, kept_at: &str, archived: &[&ChangeSnapshot]) -> bool {
    !archived.iter().any(|snapshot| {
        snapshot
            .deltas
            .iter()
            .any(|delta| delta.capability == capability)
            && archived_after(snapshot.archive_time.as_deref(), kept_at)
    })
}

/// Whether an archive time is later than a keep time, as timestamps or text.
fn archived_after(archived_at: Option<&str>, kept_at: &str) -> bool {
    let Some(archived_at) = archived_at else {
        return false;
    };
    timestamp_ms(archived_at)
        .zip(timestamp_ms(kept_at))
        .map_or_else(|| archived_at > kept_at, |(end, start)| end > start)
}

/// The first line of a comment, splitting on `\n` or `\r\n`.
fn first_line(comment: &str) -> &str {
    comment.lines().next().unwrap_or(comment)
}
