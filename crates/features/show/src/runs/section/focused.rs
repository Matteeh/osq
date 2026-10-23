//! The `Focused runs:` line of one task.

use crate::events::Event;

use super::values;

/// The note a failed focused entry carries.
const FAILED_NOTE: &str = " (attempt ended, verify skipped)";

/// The focused-runs line, or `None` without a focused run.
pub(super) fn line(events: &[Event]) -> Option<String> {
    let mut entries = Vec::new();
    for event in events {
        if event.kind != "focused_ran" {
            continue;
        }
        let outcome = match values::text(values::field(event, "outcome")) {
            Some("failed") => "failed",
            Some("problem") => "problem",
            Some("passed") => "passed",
            _ => "unavailable",
        };
        let duration = values::number(values::field(event, "duration"))
            .map_or_else(|| "unavailable".to_owned(), values::fixed_two);
        let note = if outcome == "failed" { FAILED_NOTE } else { "" };
        entries.push(format!("{outcome} {duration}s{note}"));
    }
    (!entries.is_empty()).then(|| format!("      Focused runs: {}", entries.join(", ")))
}
