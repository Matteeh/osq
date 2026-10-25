//! Finding the change folder an id or path names.

use std::path::{Path, PathBuf};

use osq_core::{FeatureError, parse_change_id};
use osq_kernel_storage::{ChangeEntry, Location};

/// One change folder found by its id or path.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Found {
    /// The folder's name.
    pub(crate) folder: String,
    /// The folder's path.
    pub(crate) path: PathBuf,
    /// Where the folder sits.
    pub(crate) location: Location,
}

/// Resolves an id or path as TypeScript's `resolveSpecFolder` does.
///
/// # Errors
///
/// Returns [`FeatureError::failed`] for an id no change folder matches.
pub(crate) fn resolve(
    root: &Path,
    id: &str,
    entries: &[ChangeEntry],
) -> Result<Found, FeatureError> {
    let trimmed = id.trim();
    if trimmed.contains('/') || Path::new(trimmed).is_absolute() {
        let candidate = if Path::new(trimmed).is_absolute() {
            PathBuf::from(trimmed)
        } else {
            root.join(trimmed)
        };
        if candidate.is_dir() {
            return Ok(found(candidate, entries));
        }
    }
    let change_id = parse_change_id(id, true)
        .map_err(|error| FeatureError::failed("show", error.to_string()))?;
    for entry in entries {
        if change_id.names(&entry.folder) {
            return Ok(Found {
                folder: entry.folder.clone(),
                path: entry.path.clone(),
                location: entry.location,
            });
        }
    }
    Err(FeatureError::failed(
        "show",
        format!("Spec \"{id}\" not found in specs or archive"),
    ))
}

/// Builds a found folder for an existing path, taking its location from the listing.
fn found(candidate: PathBuf, entries: &[ChangeEntry]) -> Found {
    let folder = candidate
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_owned();
    let location = entries
        .iter()
        .find(|entry| same_path(&entry.path, &candidate))
        .map_or(Location::Active, |entry| entry.location);
    Found {
        folder,
        path: candidate,
        location,
    }
}

/// Whether two paths name the same folder after resolving what exists.
fn same_path(left: &Path, right: &Path) -> bool {
    let left = std::fs::canonicalize(left).unwrap_or_else(|_| left.to_path_buf());
    let right = std::fs::canonicalize(right).unwrap_or_else(|_| right.to_path_buf());
    left == right
}
