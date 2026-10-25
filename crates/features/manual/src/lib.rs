//! The manual feature: keeps a human's uncommitted edits as one manual change.
//!
//! A feature crate depends only on kernel crates and core, never on another
//! feature (ADR 022).

mod feature;
mod keep;
mod manual;
mod paths;
mod refusals;
mod time;

pub use feature::ManualFeature;
