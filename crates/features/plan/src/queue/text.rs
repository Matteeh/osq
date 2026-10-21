//! Formatting the queue rows as `osq queue` prints them.

use std::collections::{BTreeMap, HashSet};
use std::fmt::Write as _;

use super::links::Choice;
use super::parse::QueueItem;

/// One line's worth of a queue item.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct QueueRow {
    /// The item's slug.
    pub(crate) slug: String,
    /// The item's title.
    pub(crate) title: String,
    /// The item's state.
    pub(crate) state: &'static str,
    /// The item's change id, when it has a change.
    pub(crate) change: Option<String>,
    /// The number of rejected changes the item has.
    pub(crate) rejections: usize,
    /// The dependency and fix slugs that have not landed.
    pub(crate) unmet: Vec<String>,
    /// Whether the item changed since it was planned.
    pub(crate) changed_since_planned: bool,
}

/// Builds each item's row from its chosen state, change and rejection count.
///
/// Implements: rust-plan/queue-text
pub(super) fn rows(items: &[QueueItem], choices: &BTreeMap<String, Choice>) -> Vec<QueueRow> {
    let landed: HashSet<&str> = items
        .iter()
        .filter(|item| {
            choices
                .get(&item.slug)
                .is_some_and(|choice| choice.state == "landed")
        })
        .map(|item| item.slug.as_str())
        .collect();
    items
        .iter()
        .map(|item| row(item, choices.get(&item.slug), &landed))
        .collect()
}

/// Builds one item's row, leaving out the unmet slugs whose item landed.
///
/// Implements: rust-plan/queue-text
fn row(item: &QueueItem, choice: Option<&Choice>, landed: &HashSet<&str>) -> QueueRow {
    let choice = choice.expect("every queue item has a choice");
    QueueRow {
        slug: item.slug.clone(),
        title: item.title.clone(),
        state: choice.state,
        change: choice.change.clone(),
        rejections: choice.rejections,
        unmet: item
            .dependencies
            .iter()
            .chain(&item.fixes)
            .filter(|slug| !landed.contains(slug.as_str()))
            .cloned()
            .collect(),
        changed_since_planned: choice.changed_since_planned,
    }
}

/// Formats queue rows as `Queue:` and one line per row.
///
/// Implements: rust-plan/queue-text
pub(super) fn format(rows: &[QueueRow]) -> String {
    let mut lines = vec!["Queue:".to_owned()];
    if rows.is_empty() {
        lines.push("  (no items)".to_owned());
    }
    for row in rows {
        let mut line = format!("  {}: {} [{}]", row.slug, row.title, row.state);
        if let Some(change) = &row.change {
            let _ = write!(line, " change: {change}");
        }
        let _ = write!(line, " rejections: {}", row.rejections);
        if !row.unmet.is_empty() {
            let _ = write!(line, " unmet: {}", row.unmet.join(", "));
        }
        if row.changed_since_planned {
            line.push_str(" changed since planned");
        }
        lines.push(line);
    }
    lines.join("\n")
}
