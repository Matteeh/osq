//! Running `approve`: find the active change, refuse steering, then seal it.

mod default_branch;
pub(crate) mod find;
mod lint;
mod lookup;
mod refuse;
mod stack;
mod steered;
mod steering;
pub(crate) mod text;
mod worktree;

use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::load_config;
use osq_kernel_specs::{SpecFinding, validate_change, validate_merged_change};
use osq_kernel_storage::{ChangeEntry, Location, StorageError, change_folder_seal, read_change};
use osq_kernel_vcs::project_git_root;

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
/// read, when the root sits below its repository's top level, when no active
/// change matches, when the change cannot be read or sealed, when it needs
/// steering, when its delta specs fail validation, when a git or file write
/// fails, or when its marker cannot be written.
///
/// Implements: rust-approve/approve-lookup
/// Implements: rust-approve/steering-refusal
/// Implements: rust-approve/steered-approval
/// Implements: rust-approve/default-branch-approval
/// Implements: rust-approve/approve-validation
/// Implements: rust-approve/approval-marker
/// Implements: rust-approve/worktree-approval
/// Implements: rust-approve/stacked-approval
/// Implements: rust-approve/approval-refusals-with-git-on
/// Implements: rust-approve/rejected-branch-claim
pub(crate) fn run_approve(
    root: &Path,
    query: &str,
    options: ApproveOptions,
) -> Result<String, FeatureError> {
    let config = load_config(root).map_err(|error| failed(&error.to_string()))?;
    let repo = project_git_root(root, &config).map_err(|error| failed(&error.to_string()))?;
    let located = lookup::list(root, &config, repo.as_deref())?;
    let active = located.iter().find(|candidate| {
        candidate.entry.location == Location::Active
            && find::matches(&candidate.entry.folder, query)
    });
    let found = match active {
        Some(found) => found,
        None => archived_match(&located, query, repo.is_some()).ok_or_else(|| {
            FeatureError::failed(
                "approve",
                text::not_found(query, &root.join("openspec").join("changes")),
            )
        })?,
    };
    let entry = &found.entry;
    let snapshot = read_change(entry).map_err(|error| failed(&error.to_string()))?;
    let in_worktree = found
        .tree
        .as_ref()
        .is_some_and(|tree| tree.folder.is_some());
    let triggers = steering::human_triggers(&snapshot, in_worktree);
    if !triggers.is_empty() {
        refuse_steering(entry, &snapshot, &triggers, in_worktree, repo.is_some())?;
        validate(entry, &root.join("openspec").join("specs"))?;
        if in_worktree && triggers.iter().any(steering::Trigger::is_default_branch) {
            let (Some(repo), Some(tree)) = (repo.as_deref(), found.tree.as_ref()) else {
                return Err(failed("a worktree approval needs git and its worktree"));
            };
            return default_branch::approve(root, entry, &snapshot, &triggers, &config, repo, tree);
        }
        return steered::approve(
            entry,
            &snapshot,
            &triggers,
            &config,
            repo.as_deref(),
            found.tree.as_ref(),
        );
    }
    validate(entry, &root.join("openspec").join("specs"))?;
    let kept = match &repo {
        Some(repo) => refuse::check(repo, &config, &snapshot, &entry.folder, options)?,
        None => None,
    };
    let seal = change_folder_seal(&entry.path).map_err(|error| failed(&error.to_string()))?;
    if let Some(repo) = repo {
        let awaited = stack::awaited(root, &config, &repo, &entry.path, &entry.folder)?;
        if !awaited.is_empty() {
            return stack::approve(
                root,
                entry,
                seal.as_str(),
                &config,
                &repo,
                kept.as_deref(),
                &awaited,
            );
        }
        return worktree::approve(root, entry, seal.as_str(), &config, &repo, kept.as_deref());
    }
    write_marker(&entry.path, seal.as_str()).map_err(|error| failed(&error.to_string()))?;
    Ok(text::approved(&entry.folder, seal.as_str()))
}

/// The first archived worktree change that matches the query and needs steering.
///
/// Implements: rust-approve/approve-lookup
fn archived_match<'a>(
    located: &'a [lookup::Located],
    query: &str,
    git_on: bool,
) -> Option<&'a lookup::Located> {
    if !git_on {
        return None;
    }
    located.iter().find(|candidate| {
        candidate.entry.location == Location::Archived
            && candidate
                .tree
                .as_ref()
                .is_some_and(|tree| tree.folder.is_some())
            && find::matches(&candidate.entry.folder, query)
            && read_change(&candidate.entry)
                .is_ok_and(|snapshot| !steering::human_triggers(&snapshot, true).is_empty())
    })
}

/// Refuses a steered change that a running task, the archive or git stops.
///
/// Implements: rust-approve/steering-refusal
fn refuse_steering(
    entry: &ChangeEntry,
    snapshot: &osq_kernel_storage::ChangeSnapshot,
    triggers: &[steering::Trigger],
    in_worktree: bool,
    git_on: bool,
) -> Result<(), FeatureError> {
    if task_running(entry, snapshot) {
        return Err(failed(&text::running(&entry.folder)));
    }
    if entry.location == Location::Archived
        && !triggers.iter().any(steering::Trigger::is_default_branch)
    {
        return Err(failed(&text::archived_steering(&entry.folder, triggers)));
    }
    if git_on && !in_worktree {
        return Err(failed(&text::checkout_steering(&entry.folder, triggers)));
    }
    Ok(())
}

/// Whether one task holds a lock marker and has no regressed, done or dead marker.
///
/// Implements: rust-approve/steering-refusal
fn task_running(entry: &ChangeEntry, snapshot: &osq_kernel_storage::ChangeSnapshot) -> bool {
    snapshot.tasks.iter().any(|task| {
        entry
            .path
            .join(".run")
            .join("running")
            .join(format!("{}.pid", task.id))
            .exists()
            && task.markers.regressed.is_none()
            && !task.done
            && task.markers.dead.is_none()
    })
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
