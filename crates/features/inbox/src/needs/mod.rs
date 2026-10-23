//! The needs-you items of the active changes.
//!
//! The items are pure functions of the snapshots, and the lines they print are
//! TypeScript's `projectNeedsYou`, `applySteeringItems` and `needsYouLine`.

mod entry;
mod line;
mod pending;
mod placeholder;
mod steering;

pub(crate) use pending::{after_land, autopilot_stopped};

use std::cmp::Ordering;

use osq_kernel_storage::{ChangeSnapshot, Location};

/// One needs-you item: the change it belongs to and the line it prints.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Item {
    /// The change id.
    pub(crate) id: String,
    /// The item's one rendered line.
    pub(crate) line: String,
}

/// One item before it is rendered, while steering can still retarget it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Entry {
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
    /// The stated need of a blocked task, when it has one.
    pub(crate) need: Option<String>,
}

impl Entry {
    /// Builds an item without steering or a need.
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
        }
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

/// The kind of a needs-you item, choosing its line.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
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
    /// A task that is dead or regressed.
    Task,
}

/// Builds the needs-you items of every active change with a proposal.
pub(crate) fn needs_you(snapshots: &[ChangeSnapshot]) -> Vec<Item> {
    let mut items = Vec::new();
    for snapshot in snapshots {
        if snapshot.location != Location::Active || !snapshot.proposal {
            continue;
        }
        let id = change_id(snapshot);
        let mut entries = entry::change_entries(snapshot, &id);
        steering::apply(snapshot, &mut entries);
        items.extend(entries.into_iter().map(|entry| Item {
            id: entry.id.clone(),
            line: line::render(&entry),
        }));
    }
    sort(items)
}

/// The archived worktree changes' needs-you items.
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
    let line = match steering::first(snapshot) {
        Some(trigger) => format!(
            "  {id}: {title} — needs steering: {} ({}) — osq plan {id}",
            trigger.name(),
            trigger.reason
        ),
        None if not_landed => {
            format!("  {id}: {title} — archived, not landed — osq land {id}")
        }
        None => return None,
    };
    Some(Item { id, line })
}

/// Sorts items stably by id: the number the id leads with, then its bytes.
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
