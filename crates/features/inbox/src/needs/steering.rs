//! The steering triggers of an approved change and the item they leave.

use osq_kernel_storage::{ChangeSnapshot, TaskFile};

use super::{Entry, Kind};

/// One active steering trigger: what it targets, its name and marker reason.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Trigger {
    /// The item the trigger targets.
    pub(crate) target: Target,
    /// The trigger's name.
    pub(crate) kind: TriggerKind,
    /// The marker's reason.
    pub(crate) reason: String,
}

/// The item a trigger targets: the change or one task.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Target {
    /// The change-regressed item.
    Change,
    /// The dead or regressed item of the task with this id.
    Task(String),
}

/// The trigger names the item line prints.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum TriggerKind {
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
    /// The trigger's name in an item line.
    pub(crate) fn name(&self) -> &'static str {
        match self.kind {
            TriggerKind::Conflict => "conflict",
            TriggerKind::RequirementChanged => "requirement_changed",
            TriggerKind::Regression => "regression",
            TriggerKind::Blocked => "blocked",
            TriggerKind::Stuck => "stuck",
        }
    }
}

/// Keeps only the first trigger's item, with `osq plan` and the trigger.
pub(crate) fn apply(snapshot: &ChangeSnapshot, entries: &mut Vec<Entry>) {
    let Some(first) = triggers(snapshot).into_iter().next() else {
        return;
    };
    let kept = take_target(entries, &first);
    entries.clear();
    let Some(mut entry) = kept else {
        return;
    };
    entry.command = format!("osq plan {}", entry.id);
    if first.kind == TriggerKind::Blocked {
        entry.need = Some(need(snapshot, &first));
    }
    entry.steering = Some(first);
    entries.push(entry);
}

/// The active triggers of an approved change, change-level first, then tasks.
fn triggers(snapshot: &ChangeSnapshot) -> Vec<Trigger> {
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
fn change_kind(reason: &str) -> Option<TriggerKind> {
    match reason {
        "sync_conflict" => Some(TriggerKind::Conflict),
        "requirement_changed" => Some(TriggerKind::RequirementChanged),
        "verify_red" | "verify_path_missing" | "sync_verify_red" => Some(TriggerKind::Regression),
        _ => None,
    }
}

/// One task's active trigger, if any.
fn task_trigger(task: &TaskFile) -> Option<Trigger> {
    let target = || Target::Task(task.id.as_str().to_owned());
    if let Some(marker) = &task.markers.regressed {
        if marker.reason == "scope_regression" && marker.verification_passed {
            return None;
        }
        return Some(Trigger {
            target: target(),
            kind: TriggerKind::Regression,
            reason: marker.reason.clone(),
        });
    }
    if task.done {
        return None;
    }
    let marker = task.markers.dead.as_ref()?;
    let kind = if marker.reason == "blocked" || marker.reason == "entry_missing" {
        TriggerKind::Blocked
    } else if marker.stuck {
        TriggerKind::Stuck
    } else {
        return None;
    };
    Some(Trigger {
        target: target(),
        kind,
        reason: marker.reason.clone(),
    })
}

/// Removes and returns the entry a trigger targets, if it exists.
fn take_target(entries: &mut Vec<Entry>, trigger: &Trigger) -> Option<Entry> {
    let index = entries.iter().position(|entry| targets(entry, trigger))?;
    Some(entries.remove(index))
}

/// Whether an entry is the halt item a trigger targets.
fn targets(entry: &Entry, trigger: &Trigger) -> bool {
    match &trigger.target {
        Target::Change => entry.kind == Kind::ChangeRegressed,
        Target::Task(number) => {
            entry.kind == Kind::Task
                && entry
                    .task
                    .as_ref()
                    .is_some_and(|task| &task.number == number)
        }
    }
}

/// The need a blocked trigger states, with every whitespace run as one space.
fn need(snapshot: &ChangeSnapshot, trigger: &Trigger) -> String {
    let Target::Task(number) = &trigger.target else {
        return String::from("(not stated)");
    };
    let task = snapshot
        .tasks
        .iter()
        .find(|task| task.id.as_str() == number);
    let text = if trigger.reason == "entry_missing" {
        match task.and_then(|task| task.markers.dead.as_ref()) {
            Some(marker) if !marker.entries.is_empty() => {
                format!("missing entry files {}", marker.entries.join(", "))
            }
            _ => String::from("(not stated)"),
        }
    } else {
        task.and_then(|task| task.markers.blocked.clone())
            .unwrap_or_else(|| String::from("(not stated)"))
    };
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}
