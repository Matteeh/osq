//! Building the land commit's message from a change folder's facts.

use osq_kernel_storage::{LandFacts, LandTask};

/// Builds the squash message for `folder` from its facts and branch head.
///
/// Implements: rust-land/land-message
pub(crate) fn format(folder: &str, facts: &LandFacts, head: Option<&str>) -> String {
    let (id, words) = subject(folder);
    let mut lines = vec![
        format!("osq: {id} {words}"),
        String::new(),
        facts.goal.clone(),
        String::new(),
    ];
    lines.extend(facts.tasks.iter().map(task_line));
    lines.push(String::new());
    lines.extend(trailers(folder, facts, head));
    lines.push(String::new());
    lines.join("\n")
}

/// The folder's numeric id and the rest with each dash replaced by a space.
///
/// Implements: rust-land/land-message
fn subject(folder: &str) -> (&str, String) {
    match folder.split_once('-') {
        Some((id, rest)) => (id, rest.replace('-', " ")),
        None => (folder, String::new()),
    }
}

/// One `[verified]` or `[manual] task <number>: <title>` line.
///
/// Implements: rust-land/land-message
fn task_line(task: &LandTask) -> String {
    let label = if task.manual { "manual" } else { "verified" };
    format!("[{label}] task {}: {}", task.number, task.title)
}

/// The trailer lines, in their required order.
///
/// Implements: rust-land/land-message
fn trailers(folder: &str, facts: &LandFacts, head: Option<&str>) -> Vec<String> {
    let mut lines = vec![format!("Osq-Change: {folder}")];
    push_optional(&mut lines, "Osq-Base", facts.base.as_deref());
    push_optional(&mut lines, "Osq-Head", head);
    push_optional(&mut lines, "Osq-Approved", facts.approved.as_deref());
    push_optional(&mut lines, "Osq-Approved-By", facts.approver.as_deref());
    let models = distinct(facts.tasks.iter().filter_map(|task| task.model.as_deref()));
    let versions = distinct(
        facts
            .tasks
            .iter()
            .filter_map(|task| task.version.as_deref()),
    );
    for model in models {
        lines.push(format!("Osq-Model: {model}"));
    }
    for version in versions {
        lines.push(format!("Osq-Version: {version}"));
    }
    lines
}

/// Adds `<key>: <value>` when `value` is present.
///
/// Implements: rust-land/land-message
fn push_optional(lines: &mut Vec<String>, key: &str, value: Option<&str>) {
    if let Some(value) = value {
        lines.push(format!("{key}: {value}"));
    }
}

/// The values in first-seen order, without repeats.
///
/// Implements: rust-land/land-message
fn distinct<'a>(values: impl Iterator<Item = &'a str>) -> Vec<String> {
    let mut found: Vec<String> = Vec::new();
    for value in values {
        if !found.iter().any(|seen| seen == value) {
            found.push(value.to_owned());
        }
    }
    found
}
