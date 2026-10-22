//! The show feature: prints one change's details as TypeScript's `osq show` does.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

mod archived;
mod digest;
mod events;
mod feature;
mod header;
mod lookup;
mod model;
mod planning;
mod runs;
mod tasks;
mod text;

pub use feature::ShowFeature;
