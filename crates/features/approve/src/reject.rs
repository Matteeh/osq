//! Running `reject`: read arguments, refuse in order, then move the change.

mod args;
mod eligibility;
mod markers;
mod record;
mod text;
mod time;

use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_storage::list_changes;

use crate::approve::find::find_change;
use crate::approve::text::not_found;

/// The command every rejection failure names.
const REJECT: &str = "reject";

/// Runs `reject` for one change id and reason, returning its three lines.
///
/// # Errors
///
/// Returns a `Usage` error before reading any file when the arguments do not
/// hold one id and one non-empty reason, and a `Failed` error with the command
/// `reject` for every refusal and filesystem failure the reject requirements
/// name.
///
/// Implements: rust-approve/reject-arguments
/// Implements: rust-approve/reject-refusals
/// Implements: rust-approve/reject-eligibility
/// Implements: rust-approve/rejection-record
pub(crate) fn run_reject(root: &Path, arguments: &[String]) -> Result<String, FeatureError> {
    let parsed = args::parse(arguments)?;
    let changes = list_changes(root);
    let entry = find_change(&changes, &parsed.id).ok_or_else(|| {
        failed(not_found(
            &parsed.id,
            &root.join("openspec").join("changes"),
        ))
    })?;
    let destination = root
        .join("openspec")
        .join("changes")
        .join("rejected")
        .join(&entry.folder);
    refuse_destination(root, &destination, &entry.folder)?;
    let markers = markers::read(&entry.path);
    refuse_running(&entry.folder, &markers)?;
    refuse_healthy(&entry.folder, &markers)?;
    let timestamp = time::now();
    move_change(&entry.path, &destination)?;
    record::write(&destination, &parsed.reason, &timestamp)
        .map_err(|error| failed(error.to_string()))?;
    Ok(text::rejected(&entry.folder, &parsed.reason, &destination))
}

/// Refuses when the rejected destination already exists, writing nothing.
///
/// Implements: rust-approve/reject-refusals
fn refuse_destination(root: &Path, destination: &Path, folder: &str) -> Result<(), FeatureError> {
    if destination.exists() {
        Err(failed(text::destination_exists(root, destination, folder)))
    } else {
        Ok(())
    }
}

/// Refuses a change that has any running task.
///
/// Implements: rust-approve/reject-refusals
fn refuse_running(folder: &str, markers: &markers::Markers) -> Result<(), FeatureError> {
    if eligibility::running(markers) {
        Err(failed(text::running(folder)))
    } else {
        Ok(())
    }
}

/// Refuses an approved change that has not failed.
///
/// Implements: rust-approve/reject-refusals
fn refuse_healthy(folder: &str, markers: &markers::Markers) -> Result<(), FeatureError> {
    if eligibility::approved(markers) && !eligibility::failed(markers) {
        Err(failed(text::healthy(folder)))
    } else {
        Ok(())
    }
}

/// Creates `openspec/changes/rejected/` and renames the change folder into it.
///
/// Implements: rust-approve/rejection-record
fn move_change(source: &Path, destination: &Path) -> Result<(), FeatureError> {
    let rejected = destination
        .parent()
        .expect("a rejection destination sits inside a parent folder");
    fs::create_dir_all(rejected)
        .map_err(|error| failed(error.to_string()))
        .and_then(|()| fs::rename(source, destination).map_err(|error| failed(error.to_string())))
}

/// Builds a failed rejection error with `message`.
fn failed(message: String) -> FeatureError {
    FeatureError::failed(REJECT, message)
}
