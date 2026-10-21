//! The report feature: displays the read model through report, query and the dashboard.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

mod feature;
mod query;

pub use feature::ReportFeature;
