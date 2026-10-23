//! The archive feature: applies an approved change's deltas and moves it to the archive.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

mod apply;
mod archive;
mod commit;
mod excerpt;
mod feature;
mod lookup;
mod record;
mod regress;
mod relocate;
mod tick;
mod time;

pub use feature::ArchiveFeature;
