//! Reading a project's change folders for the inbox.

use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_storage::{ChangeSnapshot, list_changes, read_change};

/// Reads every change folder under the project root, in listing order.
pub(crate) fn changes(root: &Path) -> Result<Vec<ChangeSnapshot>, FeatureError> {
    list_changes(root)
        .iter()
        .map(|entry| {
            read_change(entry).map_err(|error| FeatureError::failed("inbox", error.to_string()))
        })
        .collect()
}
