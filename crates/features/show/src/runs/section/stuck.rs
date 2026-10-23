//! The `Stuck:` line of one task.

use crate::events::Event;

use super::values;

/// The current stuck line, or `None` without a stuck event before the last retry.
pub(super) fn line(events: &[Event]) -> Option<String> {
    let latest = events
        .iter()
        .rev()
        .find(|event| matches!(event.kind.as_str(), "retry" | "stuck"))?;
    if latest.kind != "stuck" {
        return None;
    }
    let fingerprint = values::trimmed(values::field(latest, "fingerprint"))
        .unwrap_or_else(|| "unavailable".to_owned());
    Some(format!("      Stuck: same failure twice ({fingerprint})"))
}
