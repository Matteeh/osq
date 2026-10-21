//! The archive feature: applies an approved change's deltas and moves it to the archive.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

mod apply;
mod archive;
mod feature;
mod record;
mod relocate;
mod tick;

pub use feature::ArchiveFeature;
