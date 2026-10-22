//! Running `approve`: find the active change, refuse steering, then seal it.

pub(crate) mod find;
mod lint;
mod refuse;
mod steering;
pub(crate) mod text;
mod worktree;

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::{Config, load_config};
use osq_kernel_specs::{SpecFinding, validate_change, validate_merged_change};
use osq_kernel_storage::{
    ChangeEntry, StorageError, change_folder_seal, list_changes, read_change,
};
use osq_kernel_vcs::{GitVcs, Vcs};

/// The two flags an `approve` invocation may carry anywhere.
///
/// Implements: rust-approve/approve-arguments
#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct ApproveOptions {
    /// Approve even when HEAD is not the default branch.
    pub(crate) base_ok: bool,
    /// Approve despite uncommitted changes in task scope.
    pub(crate) ignore_dirty: bool,
}

/// Runs `approve` for one query, returning the approval lines.
///
/// # Errors
///
/// Returns a `Failed` error with the command `approve` when `osq.toml` cannot be
/// read, when no active change matches, when the change cannot be read or
/// sealed, when it needs steering, when its delta specs fail validation, when a
/// git or file write fails, or when its marker cannot be written.
///
/// Implements: rust-approve/approve-lookup
/// Implements: rust-approve/steering-refusal
/// Implements: rust-approve/approve-validation
/// Implements: rust-approve/approval-marker
/// Implements: rust-approve/worktree-approval
/// Implements: rust-approve/approval-refusals-with-git-on
/// Implements: rust-approve/rejected-branch-claim
pub(crate) fn run_approve(
    root: &Path,
    query: &str,
    options: ApproveOptions,
) -> Result<String, FeatureError> {
    let config = load_config(root).map_err(|error| failed(&error.to_string()))?;
    let changes = list_changes(root);
    let entry = find::find_change(&changes, query).ok_or_else(|| {
        FeatureError::failed(
            "approve",
            text::not_found(query, &root.join("openspec").join("changes")),
        )
    })?;
    let snapshot = read_change(entry).map_err(|error| failed(&error.to_string()))?;
    let triggers = steering::triggers(&snapshot);
    if !triggers.is_empty() {
        return Err(FeatureError::failed(
            "approve",
            text::steering(&entry.folder, &triggers),
        ));
    }
    validate(entry, &root.join("openspec").join("specs"))?;
    let repo = git_repo(root, &config);
    let kept = match &repo {
        Some(repo) => refuse::check(repo, &config, &snapshot, &entry.folder, options)?,
        None => None,
    };
    let seal = change_folder_seal(&entry.path).map_err(|error| failed(&error.to_string()))?;
    if let Some(repo) = repo {
        return worktree::approve(root, entry, seal.as_str(), &config, &repo, kept.as_deref());
    }
    write_marker(&entry.path, seal.as_str()).map_err(|error| failed(&error.to_string()))?;
    Ok(text::approved(&entry.folder, seal.as_str()))
}

/// The repository root when git is on, meaning git's top level is `root` itself.
///
/// Implements: rust-approve/worktree-approval
pub(crate) fn git_repo(root: &Path, config: &Config) -> Option<PathBuf> {
    if !config.vcs.enabled {
        return None;
    }
    let found = GitVcs::new(root)
        .with_timeouts(&config.timeouts)
        .root()
        .ok()
        .flatten()?;
    let root = fs::canonicalize(root).ok()?;
    let repo = fs::canonicalize(&found).ok()?;
    (root == repo).then_some(found)
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

/// Builds the failed error for an approve step whose message is `message`.
///
/// Implements: rust-approve/worktree-approval
fn failed(message: &str) -> FeatureError {
    FeatureError::failed("approve", message)
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
