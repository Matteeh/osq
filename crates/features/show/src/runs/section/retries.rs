//! The `Retries:` line of one task.

use crate::events::Event;

use super::values;

/// The retry counts line, or `None` without a retry event.
pub(super) fn line(events: &[Event]) -> Option<String> {
    let retries: Vec<&Event> = events
        .iter()
        .filter(|event| event.kind == "retry")
        .collect();
    let total = retries.len();
    if total == 0 {
        return None;
    }
    let automatic = retries
        .iter()
        .filter(|event| values::flag(values::field(event, "automatic")))
        .count();
    Some(format!("      Retries: {total} ({automatic} automatic)"))
}
