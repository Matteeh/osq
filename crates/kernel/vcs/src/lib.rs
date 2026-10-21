//! Version control adapter: git reads and the commits osq alone writes.
//!
//! A kernel crate depends only on core and other kernel crates (ADR 022).

mod error;
mod git;
mod port;

pub use error::VcsError;
pub use git::GitVcs;
pub use port::{DiffStat, Head, StatusEntry, Vcs, Worktree};
