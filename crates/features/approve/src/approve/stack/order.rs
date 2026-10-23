//! The folder order a stacking refusal prints.

use std::collections::BTreeSet;

/// The declared folders in order, then each overlap not already declared.
///
/// Implements: rust-approve/stacked-approval-refusal
pub(super) fn folders(declared: Vec<String>, overlaps: BTreeSet<String>) -> Vec<String> {
    let mut folders = declared;
    for folder in overlaps {
        if !folders.contains(&folder) {
            folders.push(folder);
        }
    }
    folders
}
