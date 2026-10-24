//! Collecting the exit codes of a task stream's post-spawn verify runs.
//!
//! Implements: rust-storage/task-history

use super::stream::Event;

/// Collects the exit code of every non-pre-spawn `verify_ran` event.
pub(super) fn collect(events: &[Event]) -> Vec<Option<f64>> {
    let mut codes = Vec::new();
    for event in events {
        if event.kind() != Some("verify_ran") || event.text("phase") == Some("pre_spawn") {
            continue;
        }
        codes.push(event.number("exitCode"));
    }
    codes
}
