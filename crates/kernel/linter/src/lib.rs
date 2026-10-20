//! Linter adapter: lint gates over change folders, crates and the link graph.
//!
//! A kernel crate depends only on core and other kernel crates (ADR 022).

pub mod scan;
pub mod workspace;

pub use scan::{NodeSpawn, ScanError, node_spawns};
pub use workspace::workspace_node_spawns;
