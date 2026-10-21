//! The typed tables `osq.toml` holds and the readers they share.

pub(crate) mod timeouts;
pub(crate) mod value;
pub(crate) mod vcs;

pub use timeouts::Timeouts;
pub use vcs::{ManualEdits, VcsConfig};
