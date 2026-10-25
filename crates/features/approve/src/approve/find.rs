//! Matching a query against the names of active change folders.

use osq_core::parse_change_id;
use osq_kernel_storage::{ChangeEntry, Location};

/// Finds the first active change whose name matches `query`.
///
/// Implements: rust-approve/approve-lookup
pub(crate) fn find_change<'a>(changes: &'a [ChangeEntry], query: &str) -> Option<&'a ChangeEntry> {
    changes
        .iter()
        .find(|entry| entry.location == Location::Active && matches(&entry.folder, query))
}

/// Whether a folder name matches a query that core reads as a change id.
///
/// Implements: rust-approve/approve-lookup
pub(crate) fn matches(folder: &str, query: &str) -> bool {
    parse_change_id(query, false).is_ok_and(|id| id.names(folder))
}
