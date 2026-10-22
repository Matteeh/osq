//! The `Instructions changed after approval:` line of one task.

use crate::events::Event;

use super::values;

/// The latest instructions-changed line, or `None` without the event.
pub(super) fn line(events: &[Event]) -> Option<String> {
    let latest = events
        .iter()
        .rfind(|event| event.kind == "instructions_changed")?;
    let changed = values::strings(values::field(latest, "changed"));
    Some(format!(
        "      Instructions changed after approval: {}",
        changed.join(", ")
    ))
}
