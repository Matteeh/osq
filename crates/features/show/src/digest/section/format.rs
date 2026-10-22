//! Formatting an approval digest exactly as TypeScript's formatter does.

use super::model::Digest;

/// The digest's lines, without its `Flag:` lines.
pub(super) fn lines(digest: &Digest) -> Vec<String> {
    let mut lines = vec![format!("Change: {}", digest.change)];
    if !digest.goal.is_empty() {
        lines.push(format!("Goal: {}", digest.goal));
    }
    if !digest.before_approval.is_empty() {
        lines.push("Before approval, do these first:".to_owned());
        for line in digest.before_approval.split('\n') {
            lines.push(format!("  {}", line.trim()));
        }
    }
    lines.push("Tasks:".to_owned());
    for task in &digest.tasks {
        let suffix = if task.scope_files == 1 {
            "scope file"
        } else {
            "scope files"
        };
        lines.push(format!(
            "  {}. {} ({} {})",
            task.number, task.title, task.scope_files, suffix
        ));
        if task.tests_modify {
            let tests = if task.existing_tests.is_empty() {
                "(none)".to_owned()
            } else {
                task.existing_tests.join(", ")
            };
            lines.push(format!(
                "     tests.modify: existing tests in scope: {tests}"
            ));
        }
    }
    lines.push("Capabilities:".to_owned());
    if digest.capabilities.is_empty() {
        lines.push("  (none)".to_owned());
    }
    for capability in &digest.capabilities {
        let creation = if capability.creates {
            " (new capability)"
        } else {
            ""
        };
        lines.push(format!("  {}{creation}:", capability.name));
        push_names(&mut lines, "added", &capability.added);
        push_names(&mut lines, "modified", &capability.modified);
        push_names(&mut lines, "removed", &capability.removed);
    }
    if !digest.decisions.is_empty() {
        lines.push("Decisions:".to_owned());
        for decision in &digest.decisions {
            lines.push(format!("  ADR {}: {}", decision.number, decision.rule));
        }
    }
    if !digest.human_steps.is_empty() {
        lines.push("Human steps:".to_owned());
        for line in digest.human_steps.split('\n') {
            lines.push(format!("  {}", line.trim()));
        }
    }
    lines
}

/// One indented `kind: a, b` line, or `(none)` without names.
fn push_names(lines: &mut Vec<String>, kind: &str, names: &[String]) {
    let text = if names.is_empty() {
        "(none)".to_owned()
    } else {
        names.join(", ")
    };
    lines.push(format!("    {kind}: {text}"));
}
