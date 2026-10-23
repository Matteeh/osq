//! The retry feature: clears a dead or regressed task or change so it runs again, as TypeScript's `osq retry` does.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

mod feature;
mod retry;

pub use feature::RetryFeature;
