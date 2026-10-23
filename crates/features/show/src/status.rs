//! Building the whole `osq status` text from the facts one run reads.

mod active;
mod archived;
mod rejected;
mod snapshot;
mod sync;
mod watcher;

use std::path::Path;

use osq_core::{FeatureError, Output};
use osq_kernel_storage::ChangeEntry;

use crate::facts;
use crate::lookup::Found;

/// Builds the status text followed by one newline.
///
/// # Errors
///
/// Returns [`FeatureError::failed`] for a refused config, a git read that
/// fails, or a change folder the specs kernel refuses.
///
/// Implements: rust-show/status-command
pub(crate) fn run(root: &Path) -> Result<Output, FeatureError> {
    let facts = facts::read(root)?;
    let mut lines = active::lines(&facts)?;
    lines.extend(archived::lines(&facts)?);
    lines.extend(rejected::lines(&facts));
    lines.extend(watcher::lines(root, &facts));
    Ok(Output::text(format!("{}\n", lines.join("\n"))))
}

/// The found-change view of one listing entry.
pub(crate) fn found(entry: &ChangeEntry) -> Found {
    Found {
        folder: entry.folder.clone(),
        path: entry.path.clone(),
        location: entry.location,
    }
}

/// A folder's leading digits, else its whole name.
pub(crate) fn id(folder: &str) -> String {
    let digits: String = folder.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        folder.to_owned()
    } else {
        digits
    }
}
