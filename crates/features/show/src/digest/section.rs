//! The approval digest and flag lines of one change.

mod capability;
mod flags;
mod format;
mod model;
mod read;

use std::path::{Path, PathBuf};

use osq_kernel_storage::Location;

use crate::model::Change;

/// The approval digest and `Flag:` lines, or none for an approved change.
pub(crate) fn lines(change: &Change) -> Vec<String> {
    if change.approved_hash.is_some() {
        return vec![];
    }
    let Some(root) = project_root(change) else {
        return vec![];
    };
    let digest = read::digest(change, &root);
    let mut lines = format::lines(&digest);
    lines.extend(flags::lines(change, &digest));
    lines
}

/// The project root above a change folder, three levels up when active and
/// four when archived or rejected.
fn project_root(change: &Change) -> Option<PathBuf> {
    let depth = if change.location == Location::Active {
        3
    } else {
        4
    };
    change.path.ancestors().nth(depth).map(Path::to_path_buf)
}
