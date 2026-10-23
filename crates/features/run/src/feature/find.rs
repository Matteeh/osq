//! Matching a query against the names of active change folders, as approve does.

use osq_kernel_storage::{ChangeEntry, Location};

/// Finds the first active change whose name matches `query`.
///
/// Implements: rust-run/run-refusals
pub(crate) fn find_change<'a>(changes: &'a [ChangeEntry], query: &str) -> Option<&'a ChangeEntry> {
    changes
        .iter()
        .find(|entry| entry.location == Location::Active && matches(&entry.folder, query))
}

/// Whether one change folder matches a query as TypeScript's `matchesFolder`.
///
/// Implements: rust-run/run-refusals
/// Implements: rust-run/worktree-run
pub(crate) fn names(entry: &ChangeEntry, query: &str) -> bool {
    matches(&entry.folder, query)
}

/// Whether a folder name matches a query as TypeScript's `matchesFolder` does.
///
/// Implements: rust-run/run-refusals
fn matches(folder: &str, query: &str) -> bool {
    let trimmed = query.trim();
    let padded = padded(trimmed);
    matches_prefix(folder, trimmed) || matches_prefix(folder, &padded)
}

/// Whether `folder` equals `prefix` or starts with it followed by a dash.
///
/// Implements: rust-run/run-refusals
fn matches_prefix(folder: &str, prefix: &str) -> bool {
    folder == prefix || starts_with_dash(folder, prefix)
}

/// The leading digits of `text` padded to three digits, or `text` without any.
///
/// Implements: rust-run/run-refusals
fn padded(text: &str) -> String {
    let digits: String = text.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        return text.to_owned();
    }
    let value = digits.trim_start_matches('0');
    if value.is_empty() {
        return "000".to_owned();
    }
    format!("{value:0>3}")
}

/// Whether `folder` starts with `prefix` followed by a dash.
///
/// Implements: rust-run/run-refusals
fn starts_with_dash(folder: &str, prefix: &str) -> bool {
    folder
        .strip_prefix(prefix)
        .is_some_and(|rest| rest.starts_with('-'))
}
