//! The `Verification:` section of an archived change.

use crate::events::{js_number, read};
use crate::model::Change;

use super::values::{number, text, time, trimmed};

/// One recorded `check_ran` row.
struct Check {
    /// The event's timestamp, or `unavailable`.
    time: String,
    /// The trimmed command, or `unavailable`.
    command: String,
    /// The finite exit code, if any.
    exit: Option<f64>,
}

/// One recorded `verification_recorded` row.
struct RecordedOutcome {
    /// The event's timestamp, or `unavailable`.
    time: String,
    /// The recorded `passed` or `failed` outcome.
    outcome: Option<String>,
    /// The trimmed note, if any.
    note: Option<String>,
}

/// The `Verification:` lines, or none for a change without a history.
///
/// Implements: rust-show/show-text
pub(super) fn lines(change: &Change) -> Vec<String> {
    if !change.archived {
        return Vec::new();
    }
    let events = read(change);
    let mut checks = Vec::new();
    let mut outcomes = Vec::new();
    for event in &events.timeline {
        match event.kind.as_str() {
            "check_ran" => checks.push(check(event)),
            "verification_recorded" => outcomes.push(recorded_outcome(event)),
            _ => {}
        }
    }
    if checks.is_empty() && outcomes.is_empty() {
        return Vec::new();
    }
    let mut lines = vec!["Verification:".to_owned()];
    lines.extend(checks.iter().map(check_line));
    lines.extend(outcomes.iter().map(outcome_line));
    lines
}

/// One `check_ran` event's row.
fn check(event: &crate::events::Event) -> Check {
    Check {
        time: shown_time(&event.timestamp),
        command: trimmed(event.field("command")).unwrap_or_else(|| "unavailable".to_owned()),
        exit: number(event.field("exitCode")),
    }
}

/// One `verification_recorded` event's row.
fn recorded_outcome(event: &crate::events::Event) -> RecordedOutcome {
    let recorded = text(event.field("outcome"));
    RecordedOutcome {
        time: shown_time(&event.timestamp),
        outcome: recorded
            .filter(|value| matches!(*value, "passed" | "failed"))
            .map(ToOwned::to_owned),
        note: trimmed(event.field("note")),
    }
}

/// A timestamp when it parses, else `unavailable`.
fn shown_time(timestamp: &str) -> String {
    if time(timestamp).is_some() {
        timestamp.to_owned()
    } else {
        "unavailable".to_owned()
    }
}

/// One `check_ran` line.
fn check_line(check: &Check) -> String {
    let exit = check
        .exit
        .map_or_else(|| "unavailable".to_owned(), js_number);
    format!(
        "  check_ran {}: {} (exit {exit})",
        check.time, check.command
    )
}

/// One `verification_recorded` line.
fn outcome_line(outcome: &RecordedOutcome) -> String {
    let recorded = outcome.outcome.as_deref().unwrap_or("unavailable");
    let note = outcome.note.as_deref().unwrap_or("none");
    format!(
        "  verification_recorded {}: {recorded} (note: {note})",
        outcome.time
    )
}
