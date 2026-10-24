//! The needs-you items of the active changes.
//!
//! The items are pure functions of the snapshots, and both the lines they print
//! and their JSON objects are rendered from the same facts, as TypeScript's
//! `projectNeedsYou`, `applySteeringItems` and `needsYouLine` do.

mod entry;
mod line;
mod pending;
mod placeholder;
pub(crate) mod steering;

pub(crate) use pending::{after_land, autopilot_stopped};

use std::cmp::Ordering;

use osq_kernel_storage::{ChangeSnapshot, Location};

/// The validator run facts a validator-failing item carries.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ValidatorFacts {
    /// The run's outcome.
    pub(crate) outcome: String,
    /// The runs from the end in a row with a failing outcome.
    pub(crate) runs: usize,
    /// The run's error text.
    pub(crate) error: String,
}

/// The stop record facts an autopilot-stopped item carries.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct AutopilotFacts {
    /// Why autopilot stopped.
    pub(crate) reason: String,
    /// The queue item autopilot stopped on.
    pub(crate) item: String,
    /// The change id, or `None` before the item has a change.
    pub(crate) change: Option<String>,
    /// The record's detail, as written, or `None` without one.
    pub(crate) detail: Option<String>,
}

/// One needs-you item: the facts both its line and its JSON object print.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Item {
    /// The change id.
    pub(crate) id: String,
    /// The change title.
    pub(crate) title: String,
    /// The task the item names, or `None` for a change-level item.
    pub(crate) task: Option<TaskRef>,
    /// What the item is.
    pub(crate) kind: Kind,
    /// The command the item offers.
    pub(crate) command: String,
    /// The steering trigger the item carries, when a trigger targeted it.
    pub(crate) steering: Option<steering::Trigger>,
    /// The stated need of a blocked task, with its whitespace as read.
    pub(crate) need: Option<String>,
    /// The dead marker's fingerprint when the task died stuck.
    pub(crate) stuck: Option<String>,
}

impl Item {
    /// Builds an item without steering, a need or a fingerprint.
    pub(crate) fn new(
        id: &str,
        title: &str,
        task: Option<TaskRef>,
        kind: Kind,
        command: String,
    ) -> Self {
        Self {
            id: id.to_owned(),
            title: title.to_owned(),
            task,
            kind,
            command,
            steering: None,
            need: None,
            stuck: None,
        }
    }

    /// The item's one rendered line.
    pub(crate) fn line(&self) -> String {
        line::render(self)
    }
}

/// A task id and the title an item prints for it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct TaskRef {
    /// The task id as written.
    pub(crate) number: String,
    /// The task title, or `<id>.md`.
    pub(crate) title: String,
}

/// The kind of a needs-you item, with the facts only its kind carries.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Kind {
    /// An unapproved change whose verify is empty or a placeholder.
    Planning,
    /// An unapproved change ready for approval.
    Approval {
        /// Whether the proposal asks for its steps before approval.
        steps_first: bool,
    },
    /// An approved change whose change record regressed.
    ChangeRegressed,
    /// A task that died.
    TaskDead,
    /// A task that regressed.
    TaskRegressed,
    /// An archived worktree change that has not landed.
    ChangeArchived,
    /// The one recorded failed after-land command.
    AfterLandFailed,
    /// The latest validator run, when it failed.
    ValidatorFailing(ValidatorFacts),
    /// The one recorded autopilot stop.
    AutopilotStopped(AutopilotFacts),
}

impl Kind {
    /// The kind's name in the JSON object.
    pub(crate) fn name(&self) -> &'static str {
        match self {
            Self::Planning => "planning",
            Self::Approval { .. } => "approval",
            Self::ChangeRegressed => "change-regressed",
            Self::TaskDead => "task-dead",
            Self::TaskRegressed => "task-regressed",
            Self::ChangeArchived => "change-archived",
            Self::AfterLandFailed => "after-land-failed",
            Self::ValidatorFailing(_) => "validator-failing",
            Self::AutopilotStopped(_) => "autopilot-stopped",
        }
    }

    /// Whether the item prints `beforeApproval`.
    pub(crate) fn before_approval(&self) -> bool {
        matches!(self, Self::Approval { steps_first: true })
    }
}

/// Builds the needs-you items of every active change with a proposal.
///
/// Implements: rust-inbox/needs-you-items
pub(crate) fn needs_you(snapshots: &[ChangeSnapshot]) -> Vec<Item> {
    let mut items = Vec::new();
    for snapshot in snapshots {
        if snapshot.location != Location::Active || !snapshot.proposal {
            continue;
        }
        let id = change_id(snapshot);
        let mut entries = entry::change_entries(snapshot, &id);
        steering::apply(snapshot, &mut entries);
        items.extend(entries);
    }
    sort(items)
}

/// The archived worktree changes' needs-you items.
///
/// Implements: rust-inbox/archived-items
pub(crate) fn archived(changes: &[crate::read::ArchivedChange]) -> Vec<Item> {
    changes
        .iter()
        .filter_map(|change| archived_item(&change.snapshot, change.not_landed))
        .collect()
}

/// One archived change's item, steering first and not-landed second.
fn archived_item(snapshot: &ChangeSnapshot, not_landed: bool) -> Option<Item> {
    let id = change_id(snapshot);
    let title = snapshot
        .title
        .clone()
        .unwrap_or_else(|| snapshot.folder.clone());
    if let Some(trigger) = steering::first(snapshot) {
        let mut item = Item::new(
            &id,
            &title,
            None,
            Kind::ChangeRegressed,
            format!("osq plan {id}"),
        );
        item.steering = Some(trigger);
        return Some(item);
    }
    not_landed.then(|| {
        Item::new(
            &id,
            &title,
            None,
            Kind::ChangeArchived,
            format!("osq land {id}"),
        )
    })
}

/// Sorts items stably by id: the number the id leads with, then its bytes.
///
/// Implements: rust-inbox/needs-you-order
pub(crate) fn sort(mut items: Vec<Item>) -> Vec<Item> {
    items.sort_by(|left, right| compare_ids(&left.id, &right.id));
    items
}

/// A change's id: its leading digits, else its folder name.
fn change_id(snapshot: &ChangeSnapshot) -> String {
    if snapshot.id.is_empty() {
        snapshot.folder.clone()
    } else {
        snapshot.id.clone()
    }
}

/// Orders two ids by leading number first, then by bytes.
fn compare_ids(left: &str, right: &str) -> Ordering {
    match (leading_number(left), leading_number(right)) {
        (Some(a), Some(b)) => a.cmp(&b).then_with(|| left.cmp(right)),
        _ => left.cmp(right),
    }
}

/// The number an id leads with, or `None` when it leads with no digit.
fn leading_number(id: &str) -> Option<u128> {
    let digits: String = id.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}
