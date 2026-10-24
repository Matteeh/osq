//! The after-land-failed and autopilot-stopped needs-you items.
//!
//! Both are pure functions of the snapshots, the records and the queue titles.

use osq_kernel_storage::{AfterLandFailure, AutopilotStop, ChangeSnapshot, Location, QueueTitle};

use super::{AutopilotFacts, Item, Kind};

/// The one item a failed after-land command contributes.
///
/// Implements: rust-inbox/after-land-failed-item
pub(crate) fn after_land(snapshots: &[ChangeSnapshot], failure: &AfterLandFailure) -> Item {
    let id = match leading_digits(&failure.change) {
        Some(digits) => digits.to_owned(),
        None => failure.change.clone(),
    };
    let title = snapshots
        .iter()
        .find(|snapshot| {
            snapshot.location == Location::Archived && snapshot.folder == failure.change
        })
        .and_then(|snapshot| snapshot.title.clone())
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| failure.change.clone());
    Item::new(
        &id,
        &title,
        None,
        Kind::AfterLandFailed,
        format!("osq land {id}"),
    )
}

/// The one item an autopilot stop contributes.
///
/// Implements: rust-inbox/autopilot-stopped-item
pub(crate) fn autopilot_stopped(
    snapshots: &[ChangeSnapshot],
    queue: &[QueueTitle],
    stop: &AutopilotStop,
) -> Item {
    let id = stop.change.clone().unwrap_or_else(|| stop.item.clone());
    let title = match &stop.change {
        Some(change) => change_title(snapshots, change),
        None => queue_title(queue, &stop.item),
    };
    let facts = AutopilotFacts {
        reason: stop.reason.clone(),
        item: stop.item.clone(),
        change: stop.change.clone(),
        detail: stop.detail.clone(),
    };
    Item::new(
        &id,
        &title,
        None,
        Kind::AutopilotStopped(facts),
        stop.command.clone(),
    )
}

/// The title of the first listed change whose folder matches `change`.
fn change_title(snapshots: &[ChangeSnapshot], change: &str) -> String {
    snapshots
        .iter()
        .find(|snapshot| matches_folder(&snapshot.folder, change))
        .and_then(|snapshot| snapshot.title.clone())
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| change.to_owned())
}

/// The queue title for a slug, or the slug when the queue names none.
fn queue_title(queue: &[QueueTitle], slug: &str) -> String {
    queue
        .iter()
        .find(|item| item.slug == slug)
        .map(|item| item.title.clone())
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| slug.to_owned())
}

/// Whether a folder equals a query, its padded form, or starts with either
/// followed by `-`.
fn matches_folder(folder: &str, query: &str) -> bool {
    let trimmed = query.trim();
    let padded = padded_form(trimmed);
    folder == trimmed
        || folder == padded
        || folder.starts_with(&format!("{trimmed}-"))
        || folder.starts_with(&format!("{padded}-"))
}

/// The number a query leads with, written with at least three digits.
fn padded_form(query: &str) -> String {
    leading_digits(query).map_or_else(
        || query.to_owned(),
        |digits| {
            digits
                .parse::<u128>()
                .map_or_else(|_| query.to_owned(), |number| format!("{number:03}"))
        },
    )
}

/// The digits a string leads with, or `None` without any.
fn leading_digits(text: &str) -> Option<&str> {
    let end = text
        .char_indices()
        .take_while(|(_, character)| character.is_ascii_digit())
        .map(|(index, character)| index + character.len_utf8())
        .last()?;
    Some(&text[..end])
}
