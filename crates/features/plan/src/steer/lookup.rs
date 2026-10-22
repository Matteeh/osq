//! Finding the active change a steering id names.

use std::path::Path;

use osq_kernel_storage::{ChangeEntry, Location, list_changes};

/// Finds the first active change whose name matches `id`.
///
/// Implements: rust-plan/steering-lookup
pub(super) fn find(root: &Path, id: &str) -> Option<ChangeEntry> {
    list_changes(root)
        .into_iter()
        .find(|entry| entry.location == Location::Active && matches(&entry.folder, id))
}

/// Whether a folder name matches a query as TypeScript's `matchesFolder` does.
///
/// Implements: rust-plan/steering-lookup
fn matches(folder: &str, query: &str) -> bool {
    let trimmed = query.trim();
    let padded = padded(trimmed);
    matches_prefix(folder, trimmed) || matches_prefix(folder, &padded)
}

/// Whether `folder` equals `prefix` or starts with it followed by a dash.
///
/// Implements: rust-plan/steering-lookup
fn matches_prefix(folder: &str, prefix: &str) -> bool {
    folder == prefix || starts_with_dash(folder, prefix)
}

/// The leading digits of `text` padded to three digits, or `text` without any.
///
/// Implements: rust-plan/steering-lookup
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
/// Implements: rust-plan/steering-lookup
fn starts_with_dash(folder: &str, prefix: &str) -> bool {
    folder
        .strip_prefix(prefix)
        .is_some_and(|rest| rest.starts_with('-'))
}
