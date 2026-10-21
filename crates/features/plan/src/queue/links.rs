//! Grouping change folders by queue item and choosing each item's state.

use std::collections::BTreeMap;

use osq_core::ChangeStatus;
use osq_kernel_storage::{ChangeEntry, Location};

use super::parse::QueueItem;

/// One change folder that names a queue item, with the queue fields its brief holds.
#[derive(Clone, Debug)]
pub(crate) struct Folder {
    /// The item slug the folder's brief names, trimmed.
    pub(crate) item: String,
    /// The change folder itself.
    pub(crate) entry: ChangeEntry,
    /// The brief's `queue_hash` string, when it holds one.
    pub(crate) queue_hash: Option<String>,
    /// The active folder's snapshot status, when it is readable.
    pub(crate) status: Option<ChangeStatus>,
}

/// One item's folders, grouped by where they sit.
#[derive(Clone, Debug, Default)]
pub(crate) struct Groups {
    /// The active folders.
    pub(crate) active: Vec<Folder>,
    /// The archived folders.
    pub(crate) archived: Vec<Folder>,
    /// The rejected folders.
    pub(crate) rejected: Vec<Folder>,
}

/// The state, change, rejection count and flag chosen for one queue item.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Choice {
    /// The item's state name.
    pub(super) state: &'static str,
    /// The selected change's id, when the item has a change.
    pub(super) change: Option<String>,
    /// The number of rejected folders the item has.
    pub(super) rejections: usize,
    /// Whether the selected change's brief is missing the item's hash.
    pub(super) changed_since_planned: bool,
}

/// Groups folders by their item and location, keeping listing order in each group.
///
/// Implements: rust-plan/queue-associations
pub(super) fn group(folders: Vec<Folder>) -> BTreeMap<String, Groups> {
    let mut grouped: BTreeMap<String, Groups> = BTreeMap::new();
    for folder in folders {
        let groups = grouped.entry(folder.item.clone()).or_default();
        match folder.entry.location {
            Location::Active => groups.active.push(folder),
            Location::Archived => groups.archived.push(folder),
            Location::Rejected => groups.rejected.push(folder),
        }
    }
    grouped
}

/// The ambiguity message for one item, or `None` when its folders are unambiguous.
///
/// Implements: rust-plan/queue-associations
pub(super) fn ambiguity(slug: &str, groups: &Groups) -> Option<String> {
    if groups.archived.len() > 1 {
        Some(ambiguous(slug, &groups.archived, "archived"))
    } else if groups.active.len() > 1 {
        Some(ambiguous(slug, &groups.active, "active"))
    } else {
        None
    }
}

/// Builds the ambiguity message naming a location and its folder names.
///
/// Implements: rust-plan/queue-associations
fn ambiguous(slug: &str, folders: &[Folder], location: &str) -> String {
    let names = folders
        .iter()
        .map(|folder| folder.entry.folder.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    format!("Ambiguous queue association for \"{slug}\": multiple {location} changes ({names})")
}

/// Chooses one item's state from its folders, after any ambiguity was refused.
///
/// Implements: rust-plan/queue-states
pub(super) fn select(item: &QueueItem, groups: Option<&Groups>) -> Choice {
    let rejections = groups.map_or(0, |groups| groups.rejected.len());
    let Some(groups) = groups else {
        return unplanned(rejections);
    };
    if let Some(folder) = groups.archived.first() {
        return chosen("landed", folder, item, rejections);
    }
    if let Some((folder, status)) = groups
        .active
        .first()
        .and_then(|folder| folder.status.map(|status| (folder, status)))
    {
        return chosen(map_status(status), folder, item, rejections);
    }
    if let Some(folder) = groups.rejected.last() {
        return chosen("rejected", folder, item, rejections);
    }
    unplanned(rejections)
}

/// Builds the choice for one selected folder.
///
/// Implements: rust-plan/queue-states
fn chosen(state: &'static str, folder: &Folder, item: &QueueItem, rejections: usize) -> Choice {
    Choice {
        state,
        change: Some(change_id(&folder.entry.folder)),
        rejections,
        changed_since_planned: folder.queue_hash.as_deref() != Some(item.hash.as_str()),
    }
}

/// Builds the choice for an item with no selected change folder.
///
/// Implements: rust-plan/queue-states
fn unplanned(rejections: usize) -> Choice {
    Choice {
        state: "unplanned",
        change: None,
        rejections,
        changed_since_planned: false,
    }
}

/// Maps a change status to the queue state name TypeScript gives it.
///
/// Implements: rust-plan/queue-states
fn map_status(status: ChangeStatus) -> &'static str {
    match status {
        ChangeStatus::Regressed | ChangeStatus::Dead => "dead",
        ChangeStatus::Running => "running",
        ChangeStatus::Unapproved => "planned",
        _ => "approved",
    }
}

/// A folder's leading digits, or its whole name when it has none.
///
/// Implements: rust-plan/queue-states
pub(crate) fn change_id(folder: &str) -> String {
    let digits: String = folder.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        folder.to_owned()
    } else {
        digits
    }
}
