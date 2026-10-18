//! Scope globs and living capabilities' Code ownership (ADR 026).

pub mod glob;
pub mod ownership;

pub use glob::scope_covers_path;
pub use ownership::{CapabilityOwnership, owner_capabilities, read_capability_ownership};
