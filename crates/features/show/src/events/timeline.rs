//! The `Event Timeline:` section of one change.

use crate::model::Change;

use super::model::{Data, js_string};
use super::read::read;

/// The `Event Timeline:` lines of one change.
pub(crate) fn section(change: &Change) -> Vec<String> {
    let events = read(change);
    let mut lines = vec![String::new(), "Event Timeline:".to_owned()];
    if events.timeline.is_empty() {
        lines.push("  (no events recorded)".to_owned());
        return lines;
    }
    for event in &events.timeline {
        lines.push(format!(
            "  {} [Task {}] {}{}",
            event.timestamp,
            event.task_number,
            event.kind,
            data_text(event.data.as_ref())
        ));
    }
    lines
}

/// The parenthesised data TypeScript prints after an event's type.
fn data_text(data: Option<&Data>) -> String {
    let Some(data) = data else {
        return String::new();
    };
    let rendered: Vec<String> = data
        .entries()
        .into_iter()
        .map(|(key, value)| format!("{key}: {}", js_string(value)))
        .collect();
    if rendered.is_empty() {
        String::new()
    } else {
        format!(" ({})", rendered.join(", "))
    }
}
