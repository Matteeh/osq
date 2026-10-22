//! The steering triggers an approved change's markers hold.

use super::{Marker, Task};

/// Whether an approved change holds an active steering trigger.
pub(crate) fn has(tasks: &[Task], change: Option<&Marker>, approved: bool) -> bool {
    if !approved {
        return false;
    }
    if change.is_some_and(|marker| change_trigger(&marker.reason)) {
        return true;
    }
    tasks.iter().any(task_trigger)
}

/// Whether a change-level regression reason is a trigger.
fn change_trigger(reason: &str) -> bool {
    matches!(
        reason,
        "sync_conflict"
            | "requirement_changed"
            | "verify_red"
            | "verify_path_missing"
            | "sync_verify_red"
    )
}

/// Whether one task's markers hold an active trigger.
fn task_trigger(task: &Task) -> bool {
    if let Some(marker) = &task.regressed {
        if marker.reason == "scope_regression" && marker.verification_passed {
            return false;
        }
        return true;
    }
    if task.done {
        return false;
    }
    let Some(marker) = &task.dead else {
        return false;
    };
    marker.reason == "blocked" || marker.reason == "entry_missing" || marker.stuck
}
