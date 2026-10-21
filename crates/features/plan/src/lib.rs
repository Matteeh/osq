//! The plan feature: a planner writes a change folder.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

mod feature;
mod queue;

pub use feature::PlanFeature;
