//! The after-land-failed and autopilot-stopped needs-you items.
//!
//! Both are pure functions of the snapshots, the records and the queue titles.

use osq_kernel_storage::{AfterLandFailure, AutopilotStop, ChangeSnapshot, Location, QueueTitle};

use super::Item;

/// The one item a failed after-land command contributes.
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
    Item {
        line: format!("  {id}: {title} — after-land command failed — osq land {id}"),
        id,
    }
}

/// The one item an autopilot stop contributes.
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
    let detail = stop
        .detail
        .as_ref()
        .map_or_else(String::new, |detail| format!(": {}", squash(detail)));
    Item {
        line: format!(
            "  {id}: {title} — autopilot stopped: {}{detail} — {}",
            stop.reason, stop.command
        ),
        id,
    }
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

/// Has every run of whitespace read as one space.
fn squash(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}
