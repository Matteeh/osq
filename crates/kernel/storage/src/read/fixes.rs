//! Reading the change ids a change folder names in its proposal's `fixes`.
//!
//! Implements: rust-storage/change-fixes

use std::fs;
use std::path::Path;

use osq_kernel_specs::parse_proposal;

/// Reads a change folder's `fixes` ids, in order.
///
/// Implements: rust-storage/change-fixes
#[must_use]
pub fn read_change_fixes(folder: &Path) -> Vec<String> {
    let proposal = folder.join("proposal.md");
    let path = if proposal.exists() {
        proposal
    } else {
        folder.join("spec.md")
    };
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    parse_proposal(&text).map_or_else(|_| Vec::new(), |parsed| parsed.fixes)
}
