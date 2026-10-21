//! `GitVcs`: one git process for each command a read needs.

mod history;
mod state;

use std::path::PathBuf;
use std::process::Command;

use crate::port::{DiffStat, Head, StatusEntry, Worktree};
use crate::{Vcs, VcsError};

/// Environment variables that would redirect osq's own git reads.
const GIT_ENV_VARS: [&str; 3] = ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE"];

/// The git-backed implementation of the read half of the port.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitVcs {
    /// The directory every git command runs in.
    root: PathBuf,
    /// The program every command starts.
    program: String,
    /// The extra environment variables, in the order they were added.
    env: Vec<(String, String)>,
}

impl GitVcs {
    /// A `git` program run in the directory `root`.
    ///
    /// Implements: rust-vcs/git-command
    #[must_use]
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            program: "git".to_owned(),
            env: Vec::new(),
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

    /// Runs one command and gives its standard output, or none when it failed.
    fn read(&self, args: &[&str]) -> Result<Option<String>, VcsError> {
        let output = self
            .command(args)
            .output()
            .map_err(|source| VcsError::Spawn {
                command: self.command_line(args),
                source,
            })?;
        if !output.status.success() {
            return Ok(None);
        }
        Ok(Some(String::from_utf8_lossy(&output.stdout).into_owned()))
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
}
