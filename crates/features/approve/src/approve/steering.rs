//! The steering triggers of an approved change, read from its marker facts.

use osq_kernel_storage::{ChangeSnapshot, HaltMarker, TaskFile};

/// One steering trigger: its target, its kind and the reason it names.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Trigger {
    /// `change` or a task id.
    pub(crate) target: String,
    /// The kind TypeScript names, such as `regression` or `dead`.
    pub(crate) kind: &'static str,
    /// The marker's reason.
    pub(crate) reason: String,
}

impl Trigger {
    /// The display TypeScript's `describeTrigger` gives: `task <n> <kind> (<reason>)`.
    ///
    /// Implements: rust-approve/steering-refusal
    pub(crate) fn describe(&self) -> String {
        let target = if self.target == "change" {
            "change".to_owned()
        } else {
            format!("task {}", self.target)
        };
        format!("{target} {} ({})", self.kind, self.reason)
    }

    /// Whether the default branch stops this trigger.
    ///
    /// Implements: rust-approve/steering-refusal
    pub(crate) fn is_default_branch(&self) -> bool {
        matches!(self.kind, "conflict" | "requirement_changed")
            || (self.kind == "regression" && self.reason == "sync_verify_red")
    }
}

/// The triggers `approve` acts on, with the dead fallback for an osq worktree.
///
/// Implements: rust-approve/steering-refusal
pub(crate) fn human_triggers(snapshot: &ChangeSnapshot, in_worktree: bool) -> Vec<Trigger> {
    let triggers = triggers(snapshot);
    if !in_worktree || !triggers.is_empty() {
        return triggers;
    }
    snapshot
        .tasks
        .iter()
        .filter(|task| {
            task.markers.dead.is_some() && !task.done && task.markers.regressed.is_none()
        })
        .filter_map(|task| {
            task.markers.dead.as_ref().map(|marker| Trigger {
                target: task.id.to_string(),
                kind: "dead",
                reason: marker.reason.clone(),
            })
        })
        .collect()
}

/// The derived steering triggers of an approved change, in order.
///
/// Implements: rust-approve/steering-refusal
fn triggers(snapshot: &ChangeSnapshot) -> Vec<Trigger> {
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
fn change_trigger(marker: Option<&HaltMarker>) -> Option<Trigger> {
    let marker = marker?;
    let kind = match marker.reason.as_str() {
        "sync_conflict" => "conflict",
        "requirement_changed" => "requirement_changed",
        "verify_red" | "verify_path_missing" | "sync_verify_red" => "regression",
        _ => return None,
    };
    Some(Trigger {
        target: "change".to_owned(),
        kind,
        reason: marker.reason.clone(),
    })
}

/// One task's active trigger, if any.
///
/// Implements: rust-approve/steering-refusal
fn task_trigger(task: &TaskFile) -> Option<Trigger> {
    if let Some(marker) = task.markers.regressed.as_ref() {
        if marker.reason == "scope_regression" && marker.verification_passed {
            return None;
        }
        return Some(Trigger {
            target: task.id.to_string(),
            kind: "regression",
            reason: marker.reason.clone(),
        });
    }
    if task.done {
        return None;
    }
    let marker = task.markers.dead.as_ref()?;
    let kind = if matches!(marker.reason.as_str(), "blocked" | "entry_missing") {
        "blocked"
    } else if marker.stuck {
        "stuck"
    } else {
        return None;
    };
    Some(Trigger {
        target: task.id.to_string(),
        kind,
        reason: marker.reason.clone(),
    })
}
