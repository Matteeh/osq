//! Collecting the reason of every `dead` event in a task stream.
//!
//! Implements: rust-storage/task-history

use super::stream::Event;

/// Collects one trimmed reason per `dead` event in file order.
pub(super) fn collect(events: &[Event]) -> Vec<String> {
    let mut reasons = Vec::new();
    for event in events {
        if event.kind() != Some("dead") {
            continue;
        }
        let reason = event
            .text("reason")
            .map(str::trim)
            .filter(|reason| !reason.is_empty())
            .unwrap_or("unknown");
        reasons.push(reason.to_owned());
    }
    reasons
}
