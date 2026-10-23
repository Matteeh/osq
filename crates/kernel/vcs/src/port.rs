//! osq's version-control port.

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

/// One tracked file's index line ending, as `git ls-files --eol` reports it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LineEnding {
    /// The path relative to the repository.
    pub path: String,
    /// The value after `i/`, such as `lf`, `crlf`, `mixed`, `none` or `-text`.
    pub index: String,
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

/// What a merge left behind: a clean staged result or the paths in conflict.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MergeOutcome {
    /// The merge succeeded, with its result staged and not committed.
    Clean,
    /// The merge stopped on these unmerged paths.
    Conflict {
        /// The paths relative to the repository, sorted.
        paths: Vec<String>,
    },
}

/// What a fast-forward did: move HEAD, or leave it for uncommitted paths.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FastForward {
    /// HEAD moved to the commit, and these paths changed.
    Done {
        /// The changed paths relative to the repository, sorted.
        changed: Vec<String>,
    },
    /// Nothing was written, because these uncommitted paths would be lost.
    Blocked {
        /// The blocked paths relative to the repository, sorted.
        paths: Vec<String>,
    },
}

/// osq's version-control port.
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

    /// Git's version, or none when git cannot report one.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/setup-reads
    fn version(&self) -> Result<Option<String>, VcsError>;

    /// The executable hook files git would run, in byte order.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/setup-reads
    fn hook_names(&self) -> Result<Vec<String>, VcsError>;

    /// Every tracked file's index line ending, in git's order.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/setup-reads
    fn line_endings(&self) -> Result<Vec<LineEnding>, VcsError>;

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

    /// Creates the branch `name` at `base`.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses the branch.
    ///
    /// Implements: rust-vcs/branch-and-worktree-writes
    fn create_branch(&self, name: &str, base: &str) -> Result<(), VcsError>;

    /// Renames the branch `from` to `to`, keeping every commit.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses the name.
    ///
    /// Implements: rust-vcs/branch-and-worktree-writes
    fn rename_branch(&self, from: &str, to: &str) -> Result<(), VcsError>;

    /// Deletes the branch `name`, refusing any branch HEAD does not hold.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses, such as for a missing
    /// branch, a branch a worktree has checked out, or one HEAD does not hold.
    ///
    /// Implements: rust-vcs/branch-deletion
    fn delete_branch(&self, name: &str) -> Result<(), VcsError>;

    /// Adds a worktree at `path` for the existing branch `branch`.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses the worktree.
    ///
    /// Implements: rust-vcs/branch-and-worktree-writes
    fn worktree_add(&self, path: &str, branch: &str) -> Result<(), VcsError>;

    /// Removes the worktree at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses, such as for a worktree
    /// with modified or untracked files.
    ///
    /// Implements: rust-vcs/branch-and-worktree-writes
    fn worktree_remove(&self, path: &str) -> Result<(), VcsError>;

    /// Drops git's records of worktrees whose folder no longer exists.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses.
    ///
    /// Implements: rust-vcs/branch-and-worktree-writes
    fn worktree_prune(&self) -> Result<(), VcsError>;

    /// Stages exactly `paths`, deletions included; nothing runs when it is
    /// empty.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses.
    ///
    /// Implements: rust-vcs/commit-writes
    fn stage(&self, paths: &[&str]) -> Result<(), VcsError>;

    /// Stages and commits only `paths`, leaving anything else staged as it
    /// was, or with no paths commits the index as it stands, and gives the new
    /// commit.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when any command git refuses fails.
    ///
    /// Implements: rust-vcs/commit-writes
    fn commit(&self, paths: &[&str], message: &str, author: &str) -> Result<String, VcsError>;

    /// Commits `source`'s tree with `parent` first and then each of
    /// `extra_parents`, authored by `author`, leaving every ref, the index and
    /// the working tree untouched.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses the commit.
    ///
    /// Implements: rust-vcs/commit-writes
    fn commit_tree(
        &self,
        source: &str,
        parent: &str,
        message: &str,
        author: &str,
        extra_parents: &[&str],
    ) -> Result<String, VcsError>;

    /// A binary diff of the whole working tree, untracked files included,
    /// against `base`, or HEAD without one, leaving the index and the working
    /// tree as they were.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when `add` or `diff` fails, and
    /// [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/patch-and-discard
    fn patch(&self, base: Option<&str>) -> Result<String, VcsError>;

    /// Returns `paths` to HEAD's state in an osq worktree.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when a tree or branch precondition fails or
    /// a command git refuses fails, and [`VcsError::Spawn`] when the git
    /// program cannot start.
    ///
    /// Implements: rust-vcs/patch-and-discard
    fn discard(&self, paths: &[&str]) -> Result<(), VcsError>;

    /// Merges `rev`, squashed or not, leaving the result staged and not
    /// committed.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses to start the merge, and
    /// [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/merge-writes
    fn merge(&self, rev: &str, squash: bool) -> Result<MergeOutcome, VcsError>;

    /// Aborts the merge in progress.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses, such as when no merge is
    /// in progress.
    ///
    /// Implements: rust-vcs/merge-writes
    fn merge_abort(&self) -> Result<(), VcsError>;

    /// Fast-forwards to `commit`, unless an uncommitted path it changes would
    /// be overwritten.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses the fast-forward, and
    /// [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/merge-writes
    fn fast_forward(&self, commit: &str) -> Result<FastForward, VcsError>;
}
