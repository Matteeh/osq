//! The archive command's orchestrator: find the change, pass its gates, merge.

use std::fmt;
use std::fs;
use std::io;
use std::path::Path;

use osq_core::{Change, FeatureError, Seal};
use osq_kernel_config::load_config;
use osq_kernel_specs::{MergeChangeError, MergedSpec, merge_change};
use osq_kernel_storage::{ChangeEntry, ChangeSnapshot, change_folder_seal, read_change};
use osq_kernel_vcs::project_git_root;

use crate::{apply, commit, lookup, record, regress, relocate};

/// The command's name, as its errors and invocation spell it.
const COMMAND: &str = "archive";

/// The living specs folder under the project root.
const SPECS: &str = "openspec/specs";

/// The approval marker inside a change folder.
const APPROVED: &str = ".run/approved";

/// Runs `archive` for one change argument, returning the output text.
///
/// # Errors
///
/// Returns a `Failed` error when the config does not load, the change is not
/// found, is not approved, is not done, its deltas do not merge, a living file
/// cannot be written, or a worktree commit fails.
///
/// Implements: rust-archive/change-lookup
/// Implements: rust-archive/archive-record
/// Implements: rust-archive/archive-put-back
/// Implements: rust-archive/archive-move
/// Implements: rust-archive/worktree-archive
pub(crate) fn run(root: &Path, argument: &str) -> Result<String, FeatureError> {
    let config = load_config(root).map_err(|error| failed(error.to_string()))?;
    let repo = project_git_root(root, &config).map_err(|error| failed(error.to_string()))?;
    let found = lookup::find(root, &config, repo.is_some(), argument).map_err(failed)?;
    let entry = &found.entry;
    let snapshot = read_change(entry).map_err(failed)?;
    pass_gates(entry, &snapshot)?;
    refuse_stopped(entry, &snapshot.folder)?;
    let merged = merge(entry, &found.tree_root)?;
    if let Err(source) = record::write(&found.tree_root, &entry.path) {
        record::restore(&found.tree_root, &entry.path);
        return Err(cannot_write(
            &found.tree_root,
            &record::path(&entry.path),
            &source,
        ));
    }
    if let Err(error) = apply::write(&found.tree_root, &entry.path, &merged) {
        record::restore(&found.tree_root, &entry.path);
        return Err(write_failure(&found.tree_root, &error));
    }
    record::remove(&entry.path);
    let archived = relocate::run(&found.tree_root, &entry.path).map_err(failed)?;
    if found.worktree {
        if let Err(failure) = commit::run(
            &found.tree_root,
            &config,
            &entry.path,
            &entry.folder,
            snapshot.title.as_deref(),
            &archived,
        ) {
            if let Some(detail) = &failure.detail {
                let _ = regress::record(&found.tree_root.join(&archived), detail);
            }
            return Err(failure.error);
        }
        return Ok(format!("{archived} on osq/{}", entry.folder));
    }
    Ok(archived)
}

/// Refuses a change that still holds a stopped archive's record.
fn refuse_stopped(entry: &ChangeEntry, folder: &str) -> Result<(), FeatureError> {
    if record::exists(&entry.path) {
        return Err(failed(format_args!(
            "{folder} holds .run/archive-specs.json from a stopped archive"
        )));
    }
    Ok(())
}

/// Builds a `Failed` error for the archive command.
fn failed(message: impl fmt::Display) -> FeatureError {
    FeatureError::failed(COMMAND, message.to_string())
}

/// Passes the approval, done and marker gates before anything is written.
fn pass_gates(entry: &ChangeEntry, snapshot: &ChangeSnapshot) -> Result<(), FeatureError> {
    let folder = &snapshot.folder;
    let recorded =
        read_seal(&entry.path).ok_or_else(|| failed(format_args!("{folder} is not approved")))?;
    let computed = change_folder_seal(&entry.path).map_err(failed)?;
    let draft = Change::draft(
        snapshot.id.clone(),
        snapshot.tasks.iter().map(|task| task.id.clone()),
    );
    let approved = draft
        .approve(recorded, computed)
        .map_err(|_| failed(format_args!("{folder} changed since it was approved")))?;
    approved
        .archive(&snapshot.state)
        .map_err(|_| failed(format_args!("{folder} is not done")))?;
    if snapshot.tasks.iter().all(|task| task.done) {
        Ok(())
    } else {
        Err(failed(format_args!("{folder} is not done")))
    }
}

/// The seal recorded in the change folder's `.run/approved`, when it reads.
fn read_seal(folder: &Path) -> Option<Seal> {
    let text = fs::read_to_string(folder.join(APPROVED)).ok()?;
    Seal::parse(&text).ok()
}

/// Merges every delta spec before the first write.
fn merge(entry: &ChangeEntry, root: &Path) -> Result<Vec<MergedSpec>, FeatureError> {
    merge_change(&entry.path, &root.join(SPECS)).map_err(|error| match error {
        MergeChangeError::Merge { error, .. } => failed(error),
        other @ MergeChangeError::Read(_) => failed(other),
    })
}

/// Turns a failed living-file write into the archive command's error.
fn write_failure(root: &Path, error: &apply::WriteError) -> FeatureError {
    cannot_write(root, &error.path, &error.source)
}

/// Names a path that cannot be written, relative to the project root.
fn cannot_write(root: &Path, path: &Path, source: &io::Error) -> FeatureError {
    let path = path.strip_prefix(root).unwrap_or(path);
    let relative = path.to_string_lossy().replace('\\', "/");
    failed(format_args!("cannot write {relative}: {source}"))
}
