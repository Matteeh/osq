//! The steering triggers of an approved change, in TypeScript's order.

use osq_kernel_storage::{ChangeSnapshot, TaskFile};

/// One active steering trigger: what it targets, its name and marker reason.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Trigger {
    /// The item the trigger targets.
    pub(super) target: Target,
    /// The trigger's name.
    pub(super) kind: Kind,
    /// The marker's reason.
    pub(super) reason: String,
}

/// The item a trigger targets: the change or one task.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum Target {
    /// The change-regressed item.
    Change,
    /// The dead or regressed item of the task with this id.
    Task(String),
}

/// The trigger names a steering heading prints.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Kind {
    /// A sync conflict.
    Conflict,
    /// A changed requirement.
    RequirementChanged,
    /// A regression.
    Regression,
    /// A blocked task.
    Blocked,
    /// A stuck task.
    Stuck,
}

impl Trigger {
    /// The trigger's name in a steering heading.
    pub(super) fn name(&self) -> &'static str {
        match self.kind {
            Kind::Conflict => "conflict",
            Kind::RequirementChanged => "requirement_changed",
            Kind::Regression => "regression",
            Kind::Blocked => "blocked",
            Kind::Stuck => "stuck",
        }
    }

    /// The heading's target: `change` or `task <n>`.
    pub(super) fn target_name(&self) -> String {
        match &self.target {
            Target::Change => "change".to_owned(),
            Target::Task(id) => format!("task {id}"),
        }
    }

    /// The marker carrying the trigger's evidence, relative to the change folder.
    pub(super) fn marker(&self) -> String {
        let name = match &self.target {
            Target::Change => "change",
            Target::Task(id) => id,
        };
        let regressed = self.kind == Kind::Regression || self.target == Target::Change;
        let folder = if regressed { "regressed" } else { "dead" };
        format!(".run/{folder}/{name}.md")
    }

    /// Whether the trigger needs the default branch.
    pub(super) fn has_default(&self) -> bool {
        matches!(self.kind, Kind::Conflict | Kind::RequirementChanged)
            || (self.kind == Kind::Regression && self.reason == "sync_verify_red")
    }

    /// Whether the trigger is a changed requirement.
    pub(super) fn is_requirement_changed(&self) -> bool {
        self.kind == Kind::RequirementChanged
    }

    /// Whether the trigger is a sync conflict.
    pub(super) fn is_conflict(&self) -> bool {
        self.kind == Kind::Conflict
    }
}

/// The active triggers of an approved change, change-level first, then tasks.
///
/// Implements: rust-plan/steering-lookup
pub(super) fn derive(snapshot: &ChangeSnapshot) -> Vec<Trigger> {
    if !snapshot.approved {
        return Vec::new();
    }
    let mut triggers = Vec::new();
    if let Some(marker) = &snapshot.change_regressed {
        if let Some(kind) = change_kind(&marker.reason) {
            triggers.push(Trigger {
                target: Target::Change,
                kind,
                reason: marker.reason.clone(),
            });
        }
    }
    for task in &snapshot.tasks {
        if let Some(trigger) = task_trigger(task) {
            triggers.push(trigger);
        }
    }
    triggers
}

/// The trigger a change's regressed marker yields, if any.
///
/// Implements: rust-plan/steering-lookup
fn change_kind(reason: &str) -> Option<Kind> {
    match reason {
        "sync_conflict" => Some(Kind::Conflict),
        "requirement_changed" => Some(Kind::RequirementChanged),
        "verify_red" | "verify_path_missing" | "sync_verify_red" => Some(Kind::Regression),
        _ => None,
    }
}

/// One task's active trigger, if any.
///
/// Implements: rust-plan/steering-lookup
fn task_trigger(task: &TaskFile) -> Option<Trigger> {
    let target = || Target::Task(task.id.as_str().to_owned());
    if let Some(marker) = &task.markers.regressed {
        if marker.reason == "scope_regression" && marker.verification_passed {
            return None;
        }
        return Some(Trigger {
            target: target(),
            kind: Kind::Regression,
            reason: marker.reason.clone(),
        });
    }
    if task.done {
        return None;
    }
    let marker = task.markers.dead.as_ref()?;
    let kind = if marker.reason == "blocked" || marker.reason == "entry_missing" {
        Kind::Blocked
    } else if marker.stuck {
        Kind::Stuck
    } else {
        return None;
    };
    Some(Trigger {
        target: target(),
        kind,
        reason: marker.reason.clone(),
    })
}
