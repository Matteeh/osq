//! The read half of osq's version-control port.

use std::path::PathBuf;

use crate::VcsError;

/// HEAD's commit and the branch it points to, each none when git cannot name one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Head {
    /// HEAD's commit.
    pub sha: Option<String>,
    /// The branch HEAD points to.
    pub branch: Option<String>,
}

/// One working tree entry with its porcelain code.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusEntry {
    /// The two-letter porcelain code, such as ` M`, `R ` or `??`.
    pub code: String,
    /// The path relative to the repository.
    pub path: String,
    /// The old path of a rename or copy.
    pub from: Option<String>,
}

/// One entry of `git worktree list`, with its branch and HEAD.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Worktree {
    /// The worktree's path.
    pub path: String,
    /// The branch the worktree has checked out.
    pub branch: Option<String>,
    /// The worktree's HEAD commit.
    pub head: Option<String>,
}

/// The files and lines one range of commits changes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DiffStat {
    /// How many files changed.
    pub files: u64,
    /// How many lines were added.
    pub added: u64,
    /// How many lines were removed.
    pub removed: u64,
}

/// The read half of osq's version-control port.
pub trait Vcs {
    /// The repository's top level, or none when git cannot name one.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn root(&self) -> Result<Option<PathBuf>, VcsError>;

    /// HEAD's commit and the branch it points to.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn head(&self) -> Result<Head, VcsError>;

    /// The working tree's porcelain entries, untracked files included.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn status(&self) -> Result<Vec<StatusEntry>, VcsError>;

    /// One git config value, or none when the key is unset or git fails.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn config_value(&self, key: &str) -> Result<Option<String>, VcsError>;

    /// The branch `refs/remotes/origin/HEAD` names without its `origin/` prefix.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn default_branch(&self, fallback: &str) -> Result<String, VcsError>;

    /// One file's contents at a rev, or none when that rev has no such file.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn show(&self, rev: &str, path: &str) -> Result<Option<String>, VcsError>;

    /// Whether a file or directory exists at a rev.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn path_exists(&self, rev: &str, path: &str) -> Result<bool, VcsError>;

    /// Every branch whose short name starts with `prefix`, in git's order.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn list_branches(&self, prefix: &str) -> Result<Vec<String>, VcsError>;

    /// Every worktree with its path, branch and HEAD.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn worktree_list(&self) -> Result<Vec<Worktree>, VcsError>;

    /// The merge base of two revs, or none when they share no commit.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/history-reads
    fn merge_base(&self, a: &str, b: &str) -> Result<Option<String>, VcsError>;

    /// Whether `ancestor` is `descendant` or one of its ancestors.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/history-reads
    fn is_ancestor(&self, ancestor: &str, descendant: &str) -> Result<bool, VcsError>;

    /// How many commits `to` has that `from` lacks, and 0 when git fails.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/history-reads
    fn count_commits(&self, from: &str, to: &str) -> Result<u64, VcsError>;

    /// What `to` changed since its merge base with `from`, leaving out each
    /// entry of `exclude`.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/history-reads
    fn diff_stat(
        &self,
        from: &str,
        to: &str,
        exclude: &[&str],
    ) -> Result<Option<DiffStat>, VcsError>;

    /// The trimmed value of every `key` trailer on the commits `to` has that
    /// `from` lacks, newest commit first.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/history-reads
    fn trailer_values(&self, from: &str, to: &str, key: &str) -> Result<Vec<String>, VcsError>;
}
