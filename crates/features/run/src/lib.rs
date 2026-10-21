//! The run feature: hands one task at a time to an executor and verifies it.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

mod prompt;

pub use prompt::{PriorAttempt, executor_prompt};
