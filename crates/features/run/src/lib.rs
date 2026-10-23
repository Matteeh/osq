//! The run feature: hands one task at a time to an executor and verifies it.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

mod feature;
mod prompt;
mod tick;

pub use feature::RunFeature;
pub use prompt::{PriorAttempt, executor_prompt};
pub use tick::tick_task_checkbox;
