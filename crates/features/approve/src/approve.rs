//! Running `approve`: find the active change, refuse steering, then seal it.

pub(crate) mod find;
mod lint;
mod steering;
pub(crate) mod text;

use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_specs::{SpecFinding, validate_change, validate_merged_change};
use osq_kernel_storage::{
    ChangeEntry, StorageError, change_folder_seal, list_changes, read_change,
};

/// Runs `approve` for one query, returning the two approval lines.
///
/// # Errors
///
/// Returns a `Failed` error with the command `approve` when no active change
/// matches, when the change cannot be read or sealed, when it needs steering,
/// when its delta specs fail validation, or when its marker cannot be written.
///
/// Implements: rust-approve/approve-lookup
/// Implements: rust-approve/steering-refusal
/// Implements: rust-approve/approve-validation
/// Implements: rust-approve/approval-marker
pub(crate) fn run_approve(root: &Path, query: &str) -> Result<String, FeatureError> {
    let changes = list_changes(root);
    let entry = find::find_change(&changes, query).ok_or_else(|| {
        FeatureError::failed(
            "approve",
            text::not_found(query, &root.join("openspec").join("changes")),
        )
    })?;
    let snapshot = read_change(entry).map_err(|error| failed(&error))?;
    let triggers = steering::triggers(&snapshot);
    if !triggers.is_empty() {
        return Err(FeatureError::failed(
            "approve",
            text::steering(&entry.folder, &triggers),
        ));
    }
    validate(entry, &root.join("openspec").join("specs"))?;
    let seal = change_folder_seal(&entry.path).map_err(|error| failed(&error))?;
    write_marker(&entry.path, seal.as_str()).map_err(|error| failed(&error))?;
    Ok(text::approved(&entry.folder, seal.as_str()))
}

/// Validates the change's delta specs, refusing any finding the specs kernel gives.
///
/// # Errors
///
/// Returns a `Failed` error with the command `approve` when a delta spec gives a
/// finding, when merging the delta specs fails, or, with the `SpecsError`'s
/// display, when a spec cannot be read.
///
/// Implements: rust-approve/approve-validation
fn validate(entry: &ChangeEntry, specs_dir: &Path) -> Result<(), FeatureError> {
    let findings = validate_change(&entry.path, specs_dir)
        .map_err(|error| FeatureError::failed("approve", error.to_string()))?;
    refuse(&entry.folder, &findings)?;
    let findings = validate_merged_change(&entry.path, specs_dir)
        .map_err(|error| FeatureError::failed("approve", lint::merge(&entry.folder, &error)))?;
    refuse(&entry.folder, &findings)
}

/// Refuses `folder` when the validation `findings` are not empty.
///
/// Implements: rust-approve/approve-validation
fn refuse(folder: &str, findings: &[SpecFinding]) -> Result<(), FeatureError> {
    if findings.is_empty() {
        Ok(())
    } else {
        Err(FeatureError::failed(
            "approve",
            lint::findings(folder, findings),
        ))
    }
}

/// Builds the failed error for an approve step that returned a storage error.
fn failed(error: &StorageError) -> FeatureError {
    FeatureError::failed("approve", error.to_string())
}

/// Writes `seal` and a newline to the change folder's `.run/approved`.
///
/// # Errors
///
/// Returns a storage read error naming the folder or marker that cannot be
/// created or written.
///
/// Implements: rust-approve/approval-marker
fn write_marker(folder: &Path, seal: &str) -> Result<(), StorageError> {
    let run = folder.join(".run");
    fs::create_dir_all(&run).map_err(|source| StorageError::Read {
        path: run.clone(),
        source,
    })?;
    let path = run.join("approved");
    fs::write(&path, format!("{seal}\n")).map_err(|source| StorageError::Read { path, source })
}
