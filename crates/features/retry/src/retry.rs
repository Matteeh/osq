//! One retry: refuse before writing, otherwise retain the markers and record it.

mod approval;
mod args;
mod find;
mod marker;
mod record;
mod running;
mod text;
mod time;

use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_storage::list_changes;

/// Runs `retry <id> <target>` after the argument count was checked.
///
/// # Errors
///
/// Returns a `Failed` error with the command `retry` for every refusal in the
/// requirement's order and for a marker or event that cannot be written.
///
/// Implements: rust-retry/retry-refusals
/// Implements: rust-retry/retry-record
pub(crate) fn run(root: &Path, id: &str, raw_target: &str) -> Result<String, FeatureError> {
    let target = args::target(raw_target)?;
    let changes = list_changes(root);
    let changes_dir = root.join("openspec").join("changes");
    let entry = find::find_change(&changes, id).ok_or_else(|| text::not_found(id, &changes_dir))?;
    let folder = entry.path.clone();
    let folder_name = entry.folder.clone();
    let spec_id = args::id(&folder_name);
    approval::check(&folder, spec_id)?;
    running::check(&folder, spec_id, target)?;
    let failure = marker::read(&folder, &folder_name, target)?;
    marker::check_scope(&folder, &folder_name, target, &failure)?;
    record::record(&folder, spec_id, target, &failure)
}
