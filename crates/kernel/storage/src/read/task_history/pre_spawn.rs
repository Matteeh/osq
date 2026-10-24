//! Counting a task stream's pre-spawn verify runs and their declared starts.
//!
//! Implements: rust-storage/task-history

use super::stream::Event;
use super::{PreSpawnHistory, StartCount};

/// Counts the pre-spawn runs, mismatches, missing paths and declared starts.
pub(super) fn count(events: &[Event]) -> PreSpawnHistory {
    let mut history = PreSpawnHistory::default();
    for event in events {
        if event.kind() != Some("verify_ran") || event.text("phase") != Some("pre_spawn") {
            continue;
        }
        history.runs += 1;
        if event.is_true("mismatch") {
            history.mismatches += 1;
        }
        if event.is_non_empty_array("missingPaths") {
            history.missing_path_runs += 1;
        }
        let start = start(&mut history, event.text("expected"));
        let Some(start) = start else {
            continue;
        };
        start.runs += 1;
        if event.number("exitCode") == Some(0.0) {
            start.passed += 1;
        }
    }
    history
}

/// The start counter a declared `expected` names, or `None` for any other value.
fn start<'a>(
    history: &'a mut PreSpawnHistory,
    expected: Option<&str>,
) -> Option<&'a mut StartCount> {
    match expected {
        Some("red") => Some(&mut history.red),
        Some("green") => Some(&mut history.green),
        Some("any") => Some(&mut history.any),
        _ => None,
    }
}
