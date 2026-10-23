//! The change header lines, before the goal, task list and later sections.

use crate::model::{Change, SpecStatus};

/// The header lines of one change.
pub(crate) fn lines(change: &Change) -> Vec<String> {
    let mut lines = Vec::new();
    let location = if change.archived {
        "archived"
    } else {
        "active"
    };
    let approval = change.approved_hash.as_ref().map_or_else(
        || "unapproved".to_owned(),
        |hash| format!("approved ({hash})"),
    );
    lines.push(format!("Spec: {} ({})", change.folder, change.id));
    lines.push(format!("Title: {}", change.title));
    lines.push(format!("Status: [{}]", status(change.status)));
    if let Some(next) = &change.next {
        lines.push(format!("Next: {}", next.line()));
    }
    lines.extend(crate::archived::verification(change));
    if let Some(after_landing) = &change.after_landing {
        lines.push("After landing:".to_owned());
        for line in after_landing.split('\n') {
            lines.push(format!("  {line}"));
        }
    }
    lines.push(format!("Location: {location}"));
    lines.push(format!("Approval: {approval}"));
    lines.push(format!("Depends on: {}", list(&change.depends_on)));
    lines.push("Features:".to_owned());
    lines.push(format!("  Reads: {}", list(&change.reads)));
    lines.push(format!("  Writes: {}", list(&change.writes)));
    lines
}

/// A comma-separated list, or `none` when it is empty.
fn list(items: &[String]) -> String {
    if items.is_empty() {
        "none".to_owned()
    } else {
        items.join(", ")
    }
}

/// The status word the header prints.
fn status(status: SpecStatus) -> &'static str {
    status.as_str()
}
