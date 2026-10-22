//! `GitVcs`: one git process for each command a read or a write needs.

mod history;
mod merge;
mod run;
mod setup;
mod state;
mod write;

use std::path::PathBuf;
use std::process::Command;

use osq_kernel_config::Timeouts;

use crate::port::{DiffStat, FastForward, Head, LineEnding, MergeOutcome, StatusEntry, Worktree};
use crate::{Vcs, VcsError};

use run::RunOutput;

/// Environment variables that would redirect osq's own git reads.
const GIT_ENV_VARS: [&str; 3] = ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE"];

/// The git-backed implementation of the port.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitVcs {
    /// The directory every git command runs in.
    root: PathBuf,
    /// The program every command starts.
    program: String,
    /// The extra environment variables, in the order they were added.
    env: Vec<(String, String)>,
    /// The limits that bound every command.
    timeouts: Timeouts,
}

impl GitVcs {
    /// A `git` program run in the directory `root` with the default limits.
    ///
    /// Implements: rust-vcs/git-command
    #[must_use]
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            program: "git".to_owned(),
            env: Vec::new(),
            timeouts: Timeouts::default(),
        }
    }

    /// Names another program than `git`.
    ///
    /// Implements: rust-vcs/git-command
    #[must_use]
    pub fn with_program(mut self, program: impl Into<String>) -> Self {
        self.program = program.into();
        self
    }

    /// Adds one environment variable after the fixed ones.
    ///
    /// Implements: rust-vcs/git-command
    #[must_use]
    pub fn with_env(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.env.push((key.into(), value.into()));
        self
    }

    /// Bounds every command by `timeouts`.
    ///
    /// Implements: rust-vcs/git-command
    #[must_use]
    pub fn with_timeouts(mut self, timeouts: &Timeouts) -> Self {
        self.timeouts = *timeouts;
        self
    }

    /// The tree record file's path in the repository's common git directory.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/tree-record
    pub fn tree_record_path(&self) -> Result<Option<PathBuf>, VcsError> {
        state::tree_record_path(self)
    }

    /// Builds the command for one git command.
    ///
    /// Implements: rust-vcs/git-command
    #[must_use]
    pub fn command(&self, args: &[&str]) -> Command {
        let mut command = Command::new(&self.program);
        command
            .arg("-c")
            .arg("core.quotepath=false")
            .args(args)
            .current_dir(&self.root);
        for key in GIT_ENV_VARS {
            command.env_remove(key);
        }
        command.env("GIT_OPTIONAL_LOCKS", "0");
        for (key, value) in &self.env {
            command.env(key, value);
        }
        command
    }

    /// Runs one command with extra environment variables and optional standard
    /// input, giving its exit and both decoded streams.
    fn run(
        &self,
        args: &[&str],
        env: &[(&str, &str)],
        input: Option<&str>,
    ) -> Result<RunOutput, VcsError> {
        run::run(self, args, env, input)
    }

    /// Runs one read and gives its standard output, or none when it failed.
    fn read(&self, args: &[&str]) -> Result<Option<String>, VcsError> {
        let output = self.run(args, &[], None)?;
        if output.success {
            Ok(Some(output.stdout))
        } else {
            Ok(None)
        }
    }

    /// Runs one write, giving its exit and streams, or the refusal git gives
    /// with the joined command and its output.
    fn write(
        &self,
        args: &[&str],
        env: &[(&str, &str)],
        input: Option<&str>,
    ) -> Result<RunOutput, VcsError> {
        let output = self.run(args, env, input)?;
        if !output.success {
            return Err(VcsError::Failed {
                command: self.command_line(args),
                output: format!("{}{}", output.stdout, output.stderr),
            });
        }
        Ok(output)
    }

    /// The program and every argument, joined by single spaces.
    fn command_line(&self, args: &[&str]) -> String {
        std::iter::once(self.program.as_str())
            .chain(["-c", "core.quotepath=false"])
            .chain(args.iter().copied())
            .collect::<Vec<&str>>()
            .join(" ")
    }
}

impl Vcs for GitVcs {
    /// The repository's top level.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn root(&self) -> Result<Option<PathBuf>, VcsError> {
        state::root(self)
    }

    /// HEAD's commit and the branch it points to.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn head(&self) -> Result<Head, VcsError> {
        state::head(self)
    }

    /// The working tree's porcelain entries.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn status(&self) -> Result<Vec<StatusEntry>, VcsError> {
        state::status(self)
    }

    /// One git config value.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn config_value(&self, key: &str) -> Result<Option<String>, VcsError> {
        state::config_value(self, key)
    }

    /// Git's version, or none when it cannot report one.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/setup-reads
    fn version(&self) -> Result<Option<String>, VcsError> {
        setup::version(self)
    }

    /// The executable hook files git would run.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/setup-reads
    fn hook_names(&self) -> Result<Vec<String>, VcsError> {
        setup::hook_names(self)
    }

    /// Every tracked file's index line ending.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/setup-reads
    fn line_endings(&self) -> Result<Vec<LineEnding>, VcsError> {
        setup::line_endings(self)
    }

    /// The default branch, else `fallback`.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn default_branch(&self, fallback: &str) -> Result<String, VcsError> {
        state::default_branch(self, fallback)
    }

    /// One file's contents at a rev.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn show(&self, rev: &str, path: &str) -> Result<Option<String>, VcsError> {
        state::show(self, rev, path)
    }

    /// Whether a path exists at a rev.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn path_exists(&self, rev: &str, path: &str) -> Result<bool, VcsError> {
        state::path_exists(self, rev, path)
    }

    /// Every branch with the prefix.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn list_branches(&self, prefix: &str) -> Result<Vec<String>, VcsError> {
        state::list_branches(self, prefix)
    }

    /// Every worktree.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/repository-state-reads
    fn worktree_list(&self) -> Result<Vec<Worktree>, VcsError> {
        state::worktree_list(self)
    }

    /// The merge base of two revs.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/history-reads
    fn merge_base(&self, a: &str, b: &str) -> Result<Option<String>, VcsError> {
        history::merge_base(self, a, b)
    }

    /// Whether one rev is an ancestor of another.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/history-reads
    fn is_ancestor(&self, ancestor: &str, descendant: &str) -> Result<bool, VcsError> {
        history::is_ancestor(self, ancestor, descendant)
    }

    /// How many commits one rev has that another lacks.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/history-reads
    fn count_commits(&self, from: &str, to: &str) -> Result<u64, VcsError> {
        history::count_commits(self, from, to)
    }

    /// What one rev changed since its merge base with another.
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
    ) -> Result<Option<DiffStat>, VcsError> {
        history::diff_stat(self, from, to, exclude)
    }

    /// The trailer values on the commits one rev has that another lacks.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Spawn`] when the git program cannot start.
    ///
    /// Implements: rust-vcs/history-reads
    fn trailer_values(&self, from: &str, to: &str, key: &str) -> Result<Vec<String>, VcsError> {
        history::trailer_values(self, from, to, key)
    }

    /// Creates a branch.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses the branch.
    ///
    /// Implements: rust-vcs/branch-and-worktree-writes
    fn create_branch(&self, name: &str, base: &str) -> Result<(), VcsError> {
        write::create_branch(self, name, base)
    }

    /// Renames a branch.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses the name.
    ///
    /// Implements: rust-vcs/branch-and-worktree-writes
    fn rename_branch(&self, from: &str, to: &str) -> Result<(), VcsError> {
        write::rename_branch(self, from, to)
    }

    /// Deletes a branch, never forcing one HEAD does not hold.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses.
    ///
    /// Implements: rust-vcs/branch-deletion
    fn delete_branch(&self, name: &str) -> Result<(), VcsError> {
        write::delete_branch(self, name)
    }

    /// Adds a worktree.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses the worktree.
    ///
    /// Implements: rust-vcs/branch-and-worktree-writes
    fn worktree_add(&self, path: &str, branch: &str) -> Result<(), VcsError> {
        write::worktree_add(self, path, branch)
    }

    /// Removes a worktree.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses the worktree.
    ///
    /// Implements: rust-vcs/branch-and-worktree-writes
    fn worktree_remove(&self, path: &str) -> Result<(), VcsError> {
        write::worktree_remove(self, path)
    }

    /// Prunes worktrees whose folder no longer exists.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses.
    ///
    /// Implements: rust-vcs/branch-and-worktree-writes
    fn worktree_prune(&self) -> Result<(), VcsError> {
        write::worktree_prune(self)
    }

    /// Stages exactly some paths.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses.
    ///
    /// Implements: rust-vcs/commit-writes
    fn stage(&self, paths: &[&str]) -> Result<(), VcsError> {
        write::stage(self, paths)
    }

    /// Stages and commits only some paths, and gives the new commit.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when a command git refuses fails.
    ///
    /// Implements: rust-vcs/commit-writes
    fn commit(&self, paths: &[&str], message: &str, author: &str) -> Result<String, VcsError> {
        write::commit(self, paths, message, author)
    }

    /// Commits a tree with its parents, and gives the new commit.
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
    ) -> Result<String, VcsError> {
        write::commit_tree(self, source, parent, message, author, extra_parents)
    }

    /// Merges a rev, squashed or not.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses to start the merge.
    ///
    /// Implements: rust-vcs/merge-writes
    fn merge(&self, rev: &str, squash: bool) -> Result<MergeOutcome, VcsError> {
        merge::merge(self, rev, squash)
    }

    /// Aborts the merge in progress.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses the abort.
    ///
    /// Implements: rust-vcs/merge-writes
    fn merge_abort(&self) -> Result<(), VcsError> {
        merge::merge_abort(self)
    }

    /// Fast-forwards to a commit unless uncommitted paths block it.
    ///
    /// # Errors
    ///
    /// Returns [`VcsError::Failed`] when git refuses the fast-forward.
    ///
    /// Implements: rust-vcs/merge-writes
    fn fast_forward(&self, commit: &str) -> Result<FastForward, VcsError> {
        merge::fast_forward(self, commit)
    }
}
