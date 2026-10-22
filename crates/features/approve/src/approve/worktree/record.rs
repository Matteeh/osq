//! Recording a write in the checkout's tree record.

use std::path::{Path, PathBuf};

use osq_kernel_config::Timeouts;
use osq_kernel_vcs::{GitVcs, append_tree_record};

use crate::reject::time;

/// The record path, resolved once before the first write.
pub(crate) struct Recorder {
    /// The record file, or none when git names no common directory.
    path: Option<PathBuf>,
}

impl Recorder {
    /// Resolves the tree record path for `repo`.
    ///
    /// # Errors
    ///
    /// Returns the display of the git error that cannot name the path.
    ///
    /// Implements: rust-approve/worktree-approval
    pub(crate) fn new(repo: &Path, timeouts: &Timeouts) -> Result<Self, String> {
        let path = GitVcs::new(repo)
            .with_timeouts(timeouts)
            .tree_record_path()
            .map_err(|error| error.to_string())?;
        Ok(Self { path })
    }

    /// Appends `op`'s line for `root`, ignoring any failure to write it.
    ///
    /// Implements: rust-approve/worktree-approval
    pub(crate) fn record(&self, op: &str, root: &Path) {
        if let Some(path) = &self.path {
            append_tree_record(path, &time::now(), op, root);
        }
    }
}
