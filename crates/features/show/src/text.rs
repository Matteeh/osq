//! Building the whole `osq show` text in TypeScript's order.

use crate::facts::LandFacts;
use crate::model::Change;
use crate::{archived, digest, events, header, planning, tasks};

/// The whole text of one change, without the final newline.
pub(crate) fn format(change: &Change, land: Option<&LandFacts>) -> String {
    let mut lines = header::lines(change);
    lines.extend(prose("Goal:", &change.goal));
    lines.extend(prose("Contract:", &change.contract));
    lines.extend(tasks::section(change));
    lines.extend(archived::validation(change));
    lines.extend(planning::section(change));
    lines.extend(archived::recertifications(change));
    lines.extend(events::section(change));
    lines.extend(archived::land(change, land));
    lines.extend(digest::lines(change));
    lines.join("\n")
}

/// An indented prose section for a label and its text, or no lines when empty.
fn prose(label: &str, text: &str) -> Vec<String> {
    if text.is_empty() {
        return Vec::new();
    }
    let mut lines = vec![String::new(), label.to_owned()];
    for line in text.split('\n') {
        lines.push(format!("  {line}"));
    }
    lines
}
