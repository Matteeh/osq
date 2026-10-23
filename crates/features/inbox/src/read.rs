//! Reading a project's change folders for the inbox.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::{Config, VcsConfig, load_config};
use osq_kernel_storage::{
    ChangeEntry, ChangeSnapshot, ChangeTree, Location, PauseRecord, TreeCandidate, change_trees,
    list_changes, list_tree_changes, read_change, read_usage_pause,
};
use osq_kernel_vcs::{GitVcs, Vcs, Worktree, project_git_root, stacked_root};

/// The changes the inbox reads across its trees.
pub(crate) struct Changes {
    /// Every listed change, for the needs-you, running and validator groups.
    pub(crate) all: Vec<ChangeSnapshot>,
    /// Each entry's usage pause, aligned with `all`.
    pub(crate) pauses: Vec<Option<PauseRecord>>,
    /// The project root's changes, for the landed group.
    pub(crate) root: Vec<ChangeSnapshot>,
    /// The archived worktree changes and their git facts.
    pub(crate) archived: Vec<ArchivedChange>,
}

/// One archived change of a worktree tree with the facts its item needs.
pub(crate) struct ArchivedChange {
    /// The change's snapshot.
    pub(crate) snapshot: ChangeSnapshot,
    /// Whether the default branch lacks it and its branch holds an approval.
    pub(crate) not_landed: bool,
}

/// Reads the project's changes, across trees when `vcs.enabled` names git.
///
/// # Errors
///
/// Returns [`FeatureError::failed`] when the config, git or a change folder
/// cannot be read.
///
/// Implements: rust-vcs/project-root-check
pub(crate) fn changes(root: &Path) -> Result<Changes, FeatureError> {
    let config = load_config(root).map_err(|error| failed(error.to_string()))?;
    let Some(repo_root) =
        project_git_root(root, &config).map_err(|error| failed(error.to_string()))?
    else {
        return root_only(root);
    };
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let worktrees = vcs
        .worktree_list()
        .map_err(|error| failed(error.to_string()))?;
    let candidates: Vec<TreeCandidate> = worktrees.iter().map(candidate).collect();
    let stacked = stacked_folders(&repo_root, &config.vcs);
    let trees = change_trees(root, &candidates, &stacked);
    let entries = list_tree_changes(&trees);
    let (snapshots, pauses) = read_entries(&entries)?;
    let archived = archived_changes(&vcs, &config, &trees, &entries, &snapshots, &worktrees)?;
    Ok(Changes {
        all: snapshots,
        pauses,
        root: read_root(root)?.0,
        archived,
    })
}

/// Reads the project root alone, as a project without git does.
fn root_only(root: &Path) -> Result<Changes, FeatureError> {
    let (snapshots, pauses) = read_root(root)?;
    Ok(Changes {
        all: snapshots.clone(),
        pauses,
        root: snapshots,
        archived: Vec::new(),
    })
}

/// Reads every change folder directly under the project root.
fn read_root(root: &Path) -> Result<(Vec<ChangeSnapshot>, Vec<Option<PauseRecord>>), FeatureError> {
    read_entries(&list_changes(root))
}

/// Reads change entries and their usage pauses, in entry order.
fn read_entries(
    entries: &[ChangeEntry],
) -> Result<(Vec<ChangeSnapshot>, Vec<Option<PauseRecord>>), FeatureError> {
    let mut snapshots = Vec::with_capacity(entries.len());
    let mut pauses = Vec::with_capacity(entries.len());
    for entry in entries {
        snapshots.push(read(entry)?);
        pauses.push(read_usage_pause(&entry.path));
    }
    Ok((snapshots, pauses))
}

/// Reads one change entry, refusing the storage error.
fn read(entry: &ChangeEntry) -> Result<ChangeSnapshot, FeatureError> {
    read_change(entry).map_err(|error| failed(error.to_string()))
}

/// Turns one git worktree into a tree candidate.
fn candidate(worktree: &Worktree) -> TreeCandidate {
    TreeCandidate {
        path: PathBuf::from(&worktree.path),
        branch: worktree.branch.clone(),
    }
}

/// The folders directly under the stacked approvals root, or none when the
/// home is unset or the root cannot be read.
///
/// Implements: rust-inbox/inbox-trees
fn stacked_folders(repo_root: &Path, config: &VcsConfig) -> Vec<PathBuf> {
    let Some(home) = std::env::var_os("HOME") else {
        return Vec::new();
    };
    let stacked = stacked_root(config, repo_root, Path::new(&home));
    let Ok(entries) = std::fs::read_dir(&stacked) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.path())
        .collect()
}

/// The archived changes of worktree trees with their git facts.
fn archived_changes(
    vcs: &GitVcs,
    config: &Config,
    trees: &[ChangeTree],
    entries: &[ChangeEntry],
    snapshots: &[ChangeSnapshot],
    worktrees: &[Worktree],
) -> Result<Vec<ArchivedChange>, FeatureError> {
    let roots: HashSet<&Path> = worktrees
        .iter()
        .filter(|worktree| {
            worktree
                .branch
                .as_deref()
                .is_some_and(|branch| branch.starts_with("osq/"))
        })
        .map(|worktree| Path::new(&worktree.path))
        .collect();
    let fallback = config.vcs.default_branch.as_deref().unwrap_or("main");
    let default = vcs
        .default_branch(fallback)
        .map_err(|error| failed(error.to_string()))?;
    let mut archived = Vec::new();
    for (entry, snapshot) in entries.iter().zip(snapshots) {
        if entry.location != Location::Archived || !is_worktree(trees, entry, &roots) {
            continue;
        }
        let folder = &entry.folder;
        let branch = format!("osq/{folder}");
        let exists = vcs
            .list_branches(&branch)
            .map_err(|error| failed(error.to_string()))?
            .iter()
            .any(|name| name == &branch);
        let path = format!("openspec/changes/archive/{folder}");
        let landed = vcs
            .path_exists(&default, &path)
            .map_err(|error| failed(error.to_string()))?;
        let approved = exists
            && vcs
                .show(&branch, &format!("{path}/.run/approved"))
                .map_err(|error| failed(error.to_string()))?
                .is_some();
        archived.push(ArchivedChange {
            snapshot: snapshot.clone(),
            not_landed: !landed && approved,
        });
    }
    Ok(archived)
}

/// Whether an entry belongs to a worktree tree rather than the root or a stack.
fn is_worktree(trees: &[ChangeTree], entry: &ChangeEntry, roots: &HashSet<&Path>) -> bool {
    trees.iter().any(|tree| {
        tree.folder.is_some()
            && roots.contains(tree.root.as_path())
            && entry.path.starts_with(&tree.root)
    })
}

/// Builds the failed error for an inbox read.
fn failed(message: impl Into<String>) -> FeatureError {
    FeatureError::failed("inbox", message)
}
