//! The plan feature: a planner writes a change folder.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

mod arguments;
mod feature;
mod next;
mod queue;
mod steer;
mod trees;

pub use feature::PlanFeature;
