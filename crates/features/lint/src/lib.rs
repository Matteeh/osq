//! The lint feature: checks a change folder with the specs kernel's validation and the linter kernel's gates and prints the findings, as TypeScript's `osq lint` does.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

mod feature;
mod lint;

pub use feature::LintFeature;
