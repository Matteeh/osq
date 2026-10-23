//! Version control adapter: git reads and the commits osq alone writes.
//!
//! A kernel crate depends only on core and other kernel crates (ADR 022).

mod error;
mod git;
mod port;
mod project_root;
mod record;
mod stacked;

pub use error::VcsError;
pub use git::GitVcs;
pub use port::{DiffStat, FastForward, Head, LineEnding, MergeOutcome, StatusEntry, Vcs, Worktree};
pub use project_root::{NestedRoot, project_git_root};
pub use record::append_tree_record;
pub use stacked::stacked_root;
