//! Refusing a change whose approval marker is missing or stale.

use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_storage::change_folder_seal;

use super::text;

/// Refuses an unapproved or changed folder before any marker is touched.
///
/// # Errors
///
/// Returns a `Failed` error with the command `retry` when `.run/approved` is
/// missing or blank, when the folder cannot be sealed, or when the trimmed
/// marker is not the folder's current seal.
///
/// Implements: rust-retry/retry-refusals
pub(crate) fn check(folder: &Path, id: &str) -> Result<(), FeatureError> {
    let marker = folder.join(".run").join("approved");
    let approved = fs::read_to_string(&marker).unwrap_or_default();
    let approved = approved.trim();
    if approved.is_empty() {
        return Err(text::not_approved(id));
    }
    let seal = change_folder_seal(folder).map_err(|error| text::failed(error.to_string()))?;
    if approved != seal.as_str() {
        return Err(text::stale_approval(id));
    }
    Ok(())
}
