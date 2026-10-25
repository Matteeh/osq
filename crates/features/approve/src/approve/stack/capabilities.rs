//! The delta capabilities a change folder names under its `specs/` folder.

use std::collections::BTreeSet;
use std::path::Path;

/// The names of the folders directly under `folder/specs`, sorted.
///
/// Implements: rust-approve/stacked-approval
pub(super) fn read(folder: &Path) -> BTreeSet<String> {
    let Ok(entries) = std::fs::read_dir(folder.join("specs")) else {
        return BTreeSet::new();
    };
    entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect()
}
