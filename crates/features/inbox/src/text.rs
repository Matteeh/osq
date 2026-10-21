//! The inbox text: the three groups and their item lines.

/// Renders the three group line lists into the inbox text.
pub(crate) fn inbox_text(needs_you: &[String], running: &[String], landed: &[String]) -> String {
    if needs_you.is_empty() && running.is_empty() && landed.is_empty() {
        return String::from("Inbox empty.");
    }
    let mut lines = vec![String::from("Needs you")];
    push_group(&mut lines, needs_you);
    lines.push(String::from("Running"));
    push_group(&mut lines, running);
    lines.push(String::from("Landed since last look"));
    push_group(&mut lines, landed);
    lines.join("\n")
}

/// Appends one group's item lines, or the placeholder when it has none.
fn push_group(lines: &mut Vec<String>, items: &[String]) {
    if items.is_empty() {
        lines.push(String::from("  (none)"));
    } else {
        lines.extend(items.iter().cloned());
    }
}
