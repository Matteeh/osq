//! The active-change part of the status overview.

use std::path::Path;

use osq_core::{FeatureError, TaskStatus};
use osq_kernel_storage::Location;

use crate::facts::Facts;
use crate::model::{self, Task};

use super::{found, sync};

/// The `Active specs:` block, in listing order across every tree.
///
/// # Errors
///
/// Returns [`FeatureError::failed`] when a change folder with a proposal or
/// spec cannot be read.
///
/// Implements: rust-show/status-text-equals-typescript-s
pub(crate) fn lines(facts: &Facts) -> Result<Vec<String>, FeatureError> {
    let mut lines = vec!["Active specs:".to_owned()];
    let mut any = false;
    for entry in facts
        .entries()
        .iter()
        .filter(|entry| entry.location == Location::Active)
    {
        if !has_doc(&entry.path) {
            continue;
        }
        any = true;
        let change = model::read(&found(entry), facts, None)
            .map_err(|message| FeatureError::failed("status", message))?;
        let approval = if change.approved_hash.is_some() {
            "approved"
        } else {
            "unapproved"
        };
        lines.push(format!(
            "{}: {} [{}] ({approval})",
            change.folder,
            change.title,
            change.status.as_str()
        ));
        if let Some(root) = facts.worktree(entry) {
            lines.push(format!("  worktree: {}", root.display()));
            if change
                .tasks
                .iter()
                .any(|task| task.status == TaskStatus::Running)
            {
                lines.push(
                    "  warning: a task is running in this worktree; do not edit it until the task ends"
                        .to_owned(),
                );
            }
            lines.extend(sync::lines(&change));
        }
        if let Some(next) = &change.next {
            lines.push(format!("  next: {}", next.line()));
        }
        if change.tasks.is_empty() {
            lines.push("  (no tasks)".to_owned());
        } else {
            lines.extend(change.tasks.iter().map(task_line));
        }
    }
    if !any {
        lines.push("  (none)".to_owned());
    }
    Ok(lines)
}

/// Whether a change folder holds a proposal or a spec document.
fn has_doc(folder: &Path) -> bool {
    folder.join("proposal.md").is_file() || folder.join("spec.md").is_file()
}

/// One task as `osq show` prints its first line.
fn task_line(task: &Task) -> String {
    let indicator = match task.status {
        TaskStatus::Done => "[x]",
        TaskStatus::Running => "[>]",
        TaskStatus::Dead => "[!]",
        TaskStatus::Pending | TaskStatus::Regressed => "[ ]",
    };
    let status = match task.status {
        TaskStatus::Pending => "pending",
        TaskStatus::Running => "running",
        TaskStatus::Done => "done",
        TaskStatus::Dead => "dead",
        TaskStatus::Regressed => "regressed",
    };
    let dead = task
        .dead_reason()
        .map_or_else(String::new, |reason| format!(" (reason: {reason})"));
    format!(
        "  {indicator} {}. {} [{status}]{dead}",
        task.number, task.title
    )
}
