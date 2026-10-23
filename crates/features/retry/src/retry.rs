//! One retry: refuse before writing, otherwise retain the markers and record it.

mod approval;
mod archive_commit;
mod args;
mod excerpt;
mod find;
mod marker;
mod recertify;
mod record;
mod running;
mod scope;
mod text;
mod time;
mod vcs_detail;
mod yaml;

use std::path::Path;

use osq_core::FeatureError;
use osq_core::event::FailureReason;
use osq_kernel_config::load_config;
use osq_kernel_storage::list_changes;
use osq_kernel_vcs::project_git_root;

/// Runs `retry <id> <target>` after the argument count was checked.
///
/// # Errors
///
/// Returns a `Failed` error with the command `retry` for every refusal in the
/// requirement's order and for a marker or event that cannot be written.
///
/// Implements: rust-retry/retry-refusals
/// Implements: rust-retry/retry-record
/// Implements: rust-retry/scope-recertification
/// Implements: rust-retry/archived-retry
pub(crate) fn run(root: &Path, id: &str, raw_target: &str) -> Result<String, FeatureError> {
    let target = args::target(raw_target)?;
    let config = load_config(root).map_err(|error| text::failed(error.to_string()))?;
    let repo = project_git_root(root, &config).map_err(|error| text::failed(error.to_string()))?;
    let changes = list_changes(root);
    if let Some(entry) = find::find_change(&changes, id) {
        return finish(root, &entry.path, &entry.folder, target).map(|(recorded, _)| recorded.text);
    }
    let Some(archived) = find::find_archived(root, &config, repo.as_deref(), id)? else {
        let changes_dir = root.join("openspec").join("changes");
        return Err(text::not_found(id, &changes_dir));
    };
    let folder = &archived.entry.path;
    let folder_name = &archived.entry.folder;
    let spec_id = args::id(folder_name);
    if target != args::CHANGE {
        return Err(text::archived_task(folder_name, spec_id));
    }
    let snapshot = record::snapshot(folder);
    let (recorded, reason) = finish(root, folder, folder_name, target)?;
    if reason == FailureReason::CommitFailed {
        archive_commit::run(
            &archived.tree.root,
            folder,
            &archived.entry,
            spec_id,
            &archived.config,
            &snapshot,
        )?;
    } else {
        record::commit(
            &archived.tree.root,
            folder,
            spec_id,
            &archived.config,
            &recorded.retained,
        )?;
    }
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
/// Implements: rust-retry/scope-recertification
fn finish(
    root: &Path,
    folder: &Path,
    folder_name: &str,
    target: &str,
) -> Result<(record::Recorded, FailureReason), FeatureError> {
    let spec_id = args::id(folder_name);
    approval::check(folder, spec_id)?;
    running::check(folder, spec_id, target)?;
    let failure = marker::read(folder, folder_name, target)?;
    if let Some(recertified) = marker::recertification(folder, target, &failure) {
        return recertify::run(root, folder, spec_id, target, &failure, &recertified)
            .map(|recorded| (recorded, failure.reason));
    }
    record::record(folder, spec_id, target, &failure).map(|recorded| (recorded, failure.reason))
}
