//! Reading the project's config, git and change listing once per show run.

use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::{Config, VcsConfig, load_config};
use osq_kernel_storage::{
    ChangeEntry, Location, TreeCandidate, change_trees, list_changes, list_tree_changes,
};
use osq_kernel_vcs::{DiffStat, GitVcs, Vcs, Worktree, stacked_root};

use crate::lookup::Found;

/// The default branch name TypeScript falls back to when none is configured.
const MAIN: &str = "main";

/// What one show run reads from the root before it formats a change.
pub(crate) struct Facts {
    /// The root's `osq.toml`, or its defaults.
    config: Config,
    /// The git reader, absent when git is off.
    git: Option<Git>,
    /// Every change folder the lookup searches, in TypeScript's order.
    entries: Vec<ChangeEntry>,
}

/// The git reader every earlier land read shares.
struct Git {
    /// The git program rooted at the project root.
    vcs: GitVcs,
    /// The repository's top level, symlinks resolved.
    repo_root: PathBuf,
    /// The branch the default branch resolves to.
    default_branch: String,
}

/// The git facts one archived change's land view prints.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct LandFacts {
    /// Whether the default branch holds the archived folder.
    pub(crate) landed: bool,
    /// The default branch name.
    pub(crate) default_branch: String,
    /// The commits the default branch gained, when it has the change's branch.
    pub(crate) main_commits: Option<u64>,
    /// What the change's branch changed under `openspec`.
    pub(crate) diff: Option<DiffStat>,
}

/// Reads the root's config, git state and change listing once.
///
/// # Errors
///
/// Returns [`FeatureError::failed`] for a refused `osq.toml`, and for every
/// git read that fails after git is on.
///
/// Implements: rust-show/show-git-state
/// Implements: rust-show/show-lookup
pub(crate) fn read(root: &Path) -> Result<Facts, FeatureError> {
    let config = load_config(root).map_err(|error| failed(error.to_string()))?;
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let repo_root = git_root(&vcs, root);
    let git = match repo_root {
        Some(repo_root) => Some(open_git(vcs, repo_root, &config)?),
        None => None,
    };
    let entries = match (&git, config.vcs.enabled) {
        (Some(git), true) => across_trees(root, &config, git)?,
        _ => list_changes(root),
    };
    Ok(Facts {
        config,
        git,
        entries,
    })
}

/// The repository root when git is on, as TypeScript's `selectVcs` decides.
fn git_root(vcs: &GitVcs, root: &Path) -> Option<PathBuf> {
    let repo_root = vcs.root().ok().flatten()?;
    let root = real(root);
    let repo = real(&repo_root);
    (root == repo).then_some(repo)
}

/// Opens the git reader and reads the configured default branch.
fn open_git(vcs: GitVcs, repo_root: PathBuf, config: &Config) -> Result<Git, FeatureError> {
    let fallback = config.vcs.default_branch.as_deref().unwrap_or(MAIN);
    let default_branch = vcs
        .default_branch(fallback)
        .map_err(|error| failed(error.to_string()))?;
    Ok(Git {
        vcs,
        repo_root,
        default_branch,
    })
}

/// The changes across the root, its worktrees and its stacked folders.
fn across_trees(root: &Path, config: &Config, git: &Git) -> Result<Vec<ChangeEntry>, FeatureError> {
    let worktrees = git
        .vcs
        .worktree_list()
        .map_err(|error| failed(error.to_string()))?;
    let candidates: Vec<TreeCandidate> = worktrees.iter().map(candidate).collect();
    let stacked = stacked_folders(&git.repo_root, &config.vcs);
    Ok(list_tree_changes(&change_trees(
        root,
        &candidates,
        &stacked,
    )))
}

impl Facts {
    /// The listing the lookup searches.
    pub(crate) fn entries(&self) -> &[ChangeEntry] {
        &self.entries
    }

    /// Whether osq may write to git.
    pub(crate) fn vcs_enabled(&self) -> bool {
        self.config.vcs.enabled
    }

    /// The git land facts of one archived change, or none when git is off.
    ///
    /// # Errors
    ///
    /// Returns [`FeatureError::failed`] for a git read that fails.
    ///
    /// Implements: rust-show/show-land-lines
    pub(crate) fn land(&self, found: &Found) -> Result<Option<LandFacts>, FeatureError> {
        if found.location != Location::Archived {
            return Ok(None);
        }
        let Some(git) = &self.git else {
            return Ok(None);
        };
        let folder = &found.folder;
        let default = &git.default_branch;
        let archive = format!("openspec/changes/archive/{folder}");
        let landed = git
            .vcs
            .path_exists(default, &archive)
            .map_err(|error| failed(error.to_string()))?;
        let branch = format!("osq/{folder}");
        let exists = git
            .vcs
            .list_branches(&branch)
            .map_err(|error| failed(error.to_string()))?
            .iter()
            .any(|name| name == &branch);
        let main_commits = if !landed && exists {
            Some(
                git.vcs
                    .count_commits(&branch, default)
                    .map_err(|error| failed(error.to_string()))?,
            )
        } else {
            None
        };
        let diff = if exists {
            git.vcs
                .diff_stat(default, &branch, &["openspec"])
                .map_err(|error| failed(error.to_string()))?
        } else {
            None
        };
        Ok(Some(LandFacts {
            landed,
            default_branch: default.clone(),
            main_commits,
            diff,
        }))
    }
}

/// Turns one git worktree into a tree candidate.
fn candidate(worktree: &Worktree) -> TreeCandidate {
    TreeCandidate {
        path: PathBuf::from(&worktree.path),
        branch: worktree.branch.clone(),
    }
}

/// The folders directly under the stacked approvals root.
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

/// Resolves a path's symlinks, falling back to the path as given.
fn real(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// Builds the failed error for a show read.
fn failed(message: impl Into<String>) -> FeatureError {
    FeatureError::failed("show", message)
}
