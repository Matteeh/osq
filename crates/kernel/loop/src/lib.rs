//! The loop: schedules work and calls the hooks that features register; the watcher of the TypeScript version.
//!
//! A kernel crate depends only on core and other kernel crates (ADR 022).

mod active;
mod scope;

pub use active::{ActiveChange, ActiveSchedule, ActiveState, LoopError, active_schedule};
pub use scope::scope_files;
