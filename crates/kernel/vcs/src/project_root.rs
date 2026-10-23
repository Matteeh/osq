//! The one place Rust osq decides whether git is on at a project root.

use std::fmt;
use std::path::{Path, PathBuf};

use osq_kernel_config::Config;

use crate::{GitVcs, Vcs};

/// A project root that sits inside a git repository but is not its top level.
///
/// Implements: rust-vcs/project-root-check
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NestedRoot {
    /// The project root, made canonical.
    pub root: PathBuf,
    /// The repository's top level.
    pub top: PathBuf,
}

impl fmt::Display for NestedRoot {
    /// Writes the message TypeScript's `NestedRootError` carries.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "{} is inside the git repository at {} but is not its top level; run osq from {} or set vcs.enabled to false",
            self.root.display(),
            self.top.display(),
            self.top.display()
        )
    }
}

impl std::error::Error for NestedRoot {}

/// The root made canonical, or as given when that fails.
fn canonical(root: &Path) -> PathBuf {
    std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf())
}

/// Decides a project root from the canonical root and git's top level.
fn compare(root: PathBuf, top: Option<PathBuf>) -> Result<Option<PathBuf>, NestedRoot> {
    match top {
        None => Ok(None),
        Some(top) if top == root => Ok(Some(top)),
        Some(top) => Err(NestedRoot { root, top }),
    }
}

/// Whether git is on at `root`, giving the repository's top level when it is.
///
/// # Errors
///
/// Returns [`NestedRoot`] when `vcs.enabled` is true and `root` is inside a
/// repository but is not its top level.
///
/// Implements: rust-vcs/project-root-check
pub fn project_git_root(root: &Path, config: &Config) -> Result<Option<PathBuf>, NestedRoot> {
    if !config.vcs.enabled {
        return Ok(None);
    }
    let top = GitVcs::new(root)
        .with_timeouts(&config.timeouts)
        .root()
        .ok()
        .flatten();
    compare(canonical(root), top)
}
