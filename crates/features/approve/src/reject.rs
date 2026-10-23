//! Running `reject`: read arguments, read the config, find the change, reject it.

mod args;
mod eligibility;
mod markers;
mod record;
mod text;
pub(crate) mod time;
mod worktree;

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::{Config, load_config};
use osq_kernel_storage::{
    ChangeEntry, ChangeTree, Location, TreeCandidate, change_trees, list_changes, list_tree_changes,
};
use osq_kernel_vcs::{GitVcs, Vcs, Worktree, project_git_root};

use crate::approve::find::{find_change, matches};
use crate::approve::text::not_found;

/// The command every rejection failure names.
const REJECT: &str = "reject";

/// The active change a rejection query names, and the tree it lives in.
struct Found {
    /// The active change folder.
    entry: ChangeEntry,
    /// The root of the tree that holds the change.
    tree_root: PathBuf,
    /// Whether the change sits in an osq worktree.
    worktree: bool,
}

/// Runs `reject` for one change id and reason, returning its lines.
///
/// # Errors
///
/// Returns a `Usage` error before reading any file when the arguments do not
/// hold one id and one non-empty reason, a `Failed` error with the command
/// `reject` when `osq.toml` does not load or the root sits below its
/// repository's top level, and every refusal, git failure and filesystem
/// failure the reject requirements name.
///
/// Implements: rust-approve/reject-arguments
/// Implements: rust-approve/reject-refusals
/// Implements: rust-approve/reject-eligibility
/// Implements: rust-approve/rejection-record
/// Implements: rust-approve/worktree-rejection
pub(crate) fn run_reject(root: &Path, arguments: &[String]) -> Result<String, FeatureError> {
    let parsed = args::parse(arguments)?;
    let config = load_config(root).map_err(|error| failed(error.to_string()))?;
    let repo = project_git_root(root, &config).map_err(|error| failed(error.to_string()))?;
    let found = locate(root, &config, repo.as_deref(), &parsed.id)?;
    let entry = &found.entry;
    let destination = found
        .tree_root
        .join("openspec")
        .join("changes")
        .join("rejected")
        .join(&entry.folder);
    refuse_destination(&found.tree_root, &destination, &entry.folder)?;
    let markers = markers::read(&entry.path);
    refuse_running(&entry.folder, &markers)?;
    refuse_healthy(&entry.folder, &markers)?;
    let timestamp = time::now();
    move_change(&entry.path, &destination)?;
    record::write(&destination, &parsed.reason, &timestamp)
        .map_err(|error| failed(error.to_string()))?;
    if found.worktree {
        let outcome = worktree::finish(
            &found.tree_root,
            &config,
            text::id(&entry.folder),
            &entry.path,
            &destination,
            &parsed.reason,
        );
        return Ok(text::worktree_rejected(
            &entry.folder,
            &parsed.reason,
            &outcome,
        ));
    }
    Ok(text::rejected(&entry.folder, &parsed.reason, &destination))
}

/// Finds the change in the root's worktrees when git is on, else in the root.
///
/// # Errors
///
/// Returns a `Failed` error with the command `reject` when git cannot list the
/// worktrees, or when no active change matches the query.
///
/// Implements: rust-approve/worktree-rejection
fn locate(
    root: &Path,
    config: &Config,
    repo: Option<&Path>,
    query: &str,
) -> Result<Found, FeatureError> {
    if repo.is_some() {
        return locate_trees(root, config, query);
    }
    let changes = list_changes(root);
    let entry = find_change(&changes, query).ok_or_else(|| missing(root, query))?;
    Ok(Found {
        entry: entry.clone(),
        tree_root: root.to_path_buf(),
        worktree: false,
    })
}

/// Finds the first active change the query names across the root's trees.
///
/// Implements: rust-approve/worktree-rejection
fn locate_trees(root: &Path, config: &Config, query: &str) -> Result<Found, FeatureError> {
    let trees = trees(root, config)?;
    let entry = list_tree_changes(&trees)
        .into_iter()
        .find(|entry| entry.location == Location::Active && matches(&entry.folder, query))
        .ok_or_else(|| missing(root, query))?;
    let tree = trees
        .iter()
        .find(|tree| entry.path.starts_with(&tree.root))
        .ok_or_else(|| missing(root, query))?;
    Ok(Found {
        worktree: tree.folder.is_some(),
        tree_root: tree.root.clone(),
        entry,
    })
}

/// The project root's trees, with its worktrees and no stacked approvals.
///
/// Implements: rust-approve/worktree-rejection
fn trees(root: &Path, config: &Config) -> Result<Vec<ChangeTree>, FeatureError> {
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let worktrees = vcs
        .worktree_list()
        .map_err(|error| failed(error.to_string()))?;
    let candidates: Vec<TreeCandidate> = worktrees.into_iter().map(candidate).collect();
    Ok(change_trees(root, &candidates, &[]))
}

/// Turns one git worktree into a tree candidate.
///
/// Implements: rust-approve/worktree-rejection
fn candidate(worktree: Worktree) -> TreeCandidate {
    TreeCandidate {
        path: PathBuf::from(worktree.path),
        branch: worktree.branch,
    }
}

/// The refusal for a query no active change matches.
///
/// Implements: rust-approve/reject-refusals
fn missing(root: &Path, query: &str) -> FeatureError {
    failed(not_found(query, &root.join("openspec").join("changes")))
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
