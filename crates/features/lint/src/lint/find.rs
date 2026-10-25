//! Matching a query against the names of active change folders.

use osq_core::parse_change_id;
use osq_kernel_storage::{ChangeEntry, Location};

/// Finds the first active change whose name matches `query`.
///
/// Implements: rust-lint/lint-lookup
pub(crate) fn find_change<'a>(changes: &'a [ChangeEntry], query: &str) -> Option<&'a ChangeEntry> {
    let id = parse_change_id(query, false).ok()?;
    changes
        .iter()
        .find(|entry| entry.location == Location::Active && id.names(&entry.folder))
}
