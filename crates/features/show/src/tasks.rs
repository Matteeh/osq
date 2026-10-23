//! The task lines of one change.

use osq_core::TaskStatus;

use crate::model::{Change, Task};

/// The `Tasks:` section lines.
pub(crate) fn section(change: &Change) -> Vec<String> {
    let mut lines = vec![String::new(), "Tasks:".to_owned()];
    if change.tasks.is_empty() {
        lines.push("  (no tasks)".to_owned());
    } else {
        for task in &change.tasks {
            lines.extend(task_lines(change, task));
        }
    }
    lines
}

/// The header, run, disclosure and footer lines of one task.
fn task_lines(change: &Change, task: &Task) -> Vec<String> {
    let mut lines = header(change, task);
    footer(task, &mut lines);
    lines
}

/// The title, verify, run and disclosure lines of one task.
fn header(change: &Change, task: &Task) -> Vec<String> {
    let mut lines = Vec::new();
    let indicator = indicator(task.status);
    let dead = task
        .dead_reason()
        .map_or_else(String::new, |reason| format!(" (reason: {reason})"));
    lines.push(format!(
        "  {indicator} {}. {} [{}]{dead}",
        task.number,
        task.title,
        status(task.status)
    ));
    if !task.verify.is_empty() {
        lines.push(format!("      Verify: {}", task.verify));
    }
    lines.extend(crate::runs::task_lines(change, task));
    if let Some(disclosures) = &task.disclosures {
        lines.push(format!("      Disclosures: {disclosures}"));
    }
    lines
}

/// The scope, acceptance, diagnostic and result lines of one task.
fn footer(task: &Task, lines: &mut Vec<String>) {
    if !task.scope.is_empty() {
        lines.push(format!("      Scope: {}", task.scope.join(", ")));
    }
    if !task.acceptance.is_empty() {
        lines.push("      Acceptance:".to_owned());
        let item_indicator = if task.status == TaskStatus::Done {
            "[x]"
        } else {
            "[ ]"
        };
        for item in &task.acceptance {
            lines.push(format!("        - {item_indicator} {item}"));
        }
    }
    if let Some(diagnostic) = task.dead_diagnostic() {
        lines.push("      Failure diagnostic:".to_owned());
        for line in diagnostic.split('\n') {
            lines.push(format!("        {line}"));
        }
    }
    if let Some(result) = &task.result {
        lines.push("      Result:".to_owned());
        for line in result.split('\n') {
            lines.push(format!("        {line}"));
        }
    }
}

/// The checkbox indicator a task's status prints.
fn indicator(status: TaskStatus) -> &'static str {
    match status {
        TaskStatus::Done => "[x]",
        TaskStatus::Running => "[>]",
        TaskStatus::Dead => "[!]",
        TaskStatus::Pending | TaskStatus::Regressed => "[ ]",
    }
}

/// The lowercase status word a task line prints.
fn status(status: TaskStatus) -> &'static str {
    match status {
        TaskStatus::Pending => "pending",
        TaskStatus::Running => "running",
        TaskStatus::Done => "done",
        TaskStatus::Dead => "dead",
        TaskStatus::Regressed => "regressed",
    }
}
