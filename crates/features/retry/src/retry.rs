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
/// Implements: rust-retry/archived-retry
pub(crate) fn run(root: &Path, id: &str, raw_target: &str) -> Result<String, FeatureError> {
    let target = args::target(raw_target)?;
    let changes = list_changes(root);
    if let Some(entry) = find::find_change(&changes, id) {
        return finish(&entry.path, &entry.folder, target).map(|recorded| recorded.text);
    }
    let Some(archived) = find::find_archived(root, id)? else {
        let changes_dir = root.join("openspec").join("changes");
        return Err(text::not_found(id, &changes_dir));
    };
    let folder = &archived.entry.path;
    let folder_name = &archived.entry.folder;
    let spec_id = args::id(folder_name);
    if target != args::CHANGE {
        return Err(text::archived_task(folder_name, spec_id));
    }
    let recorded = finish(folder, folder_name, target)?;
    record::commit(
        &archived.tree.root,
        folder,
        spec_id,
        &archived.config,
        &recorded.retained,
    )?;
    Ok(recorded.text)
}

/// Checks approval, running state and the marker, then records the retry.
///
/// # Errors
///
/// Returns the refusal or write error for a folder that cannot be retried.
///
/// Implements: rust-retry/retry-refusals
/// Implements: rust-retry/retry-record
fn finish(
    folder: &Path,
    folder_name: &str,
    target: &str,
) -> Result<record::Recorded, FeatureError> {
    let spec_id = args::id(folder_name);
    approval::check(folder, spec_id)?;
    running::check(folder, spec_id, target)?;
    let failure = marker::read(folder, folder_name, target)?;
    marker::check_scope(folder, folder_name, target, &failure)?;
    record::record(folder, spec_id, target, &failure)
}
