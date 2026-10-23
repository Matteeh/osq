//! The doctor feature: checks the tools osq runs, such as the pi harness, and prints what is wrong, as TypeScript's `osq doctor` does.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

mod doctor;
mod feature;

pub use feature::DoctorFeature;
