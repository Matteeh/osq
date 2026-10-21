//! The steering triggers of an approved change, read from its marker facts.

use osq_kernel_storage::{ChangeSnapshot, HaltMarker, TaskFile};

/// The active steering triggers of an approved change, in order.
///
/// Implements: rust-approve/steering-refusal
pub(crate) fn triggers(snapshot: &ChangeSnapshot) -> Vec<String> {
    if !snapshot.approved {
        return Vec::new();
    }
    let mut triggers = Vec::new();
    if let Some(trigger) = change_trigger(snapshot.change_regressed.as_ref()) {
        triggers.push(trigger);
    }
    for task in &snapshot.tasks {
        if let Some(trigger) = task_trigger(task) {
            triggers.push(trigger);
        }
    }
    triggers
}

/// The change-level trigger a `regressed/change.md` marker gives, if any.
///
/// Implements: rust-approve/steering-refusal
fn change_trigger(marker: Option<&HaltMarker>) -> Option<String> {
    let marker = marker?;
    match marker.reason.as_str() {
        "sync_conflict" => Some("change conflict (sync_conflict)".to_owned()),
        "requirement_changed" => {
            Some("change requirement_changed (requirement_changed)".to_owned())
        }
        "verify_red" | "verify_path_missing" | "sync_verify_red" => {
            Some(format!("change regression ({})", marker.reason))
        }
        _ => None,
    }
}

/// One task's active trigger, if any.
///
/// Implements: rust-approve/steering-refusal
fn task_trigger(task: &TaskFile) -> Option<String> {
    if let Some(marker) = task.markers.regressed.as_ref() {
        if marker.reason == "scope_regression" && marker.verification_passed {
            return None;
        }
        return Some(format!("task {} regression ({})", task.id, marker.reason));
    }
    if task.done {
        return None;
    }
    let marker = task.markers.dead.as_ref()?;
    if matches!(marker.reason.as_str(), "blocked" | "entry_missing") {
        return Some(format!("task {} blocked ({})", task.id, marker.reason));
    }
    if marker.stuck {
        return Some(format!("task {} stuck ({})", task.id, marker.reason));
    }
    None
}
