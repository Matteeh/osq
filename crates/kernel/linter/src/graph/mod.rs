//! Building ADR 024's link graph from ADRs, living specs, code tags and
//! ownership.

mod adr;
mod build;
mod files;
mod specs;

use std::fmt;

use osq_kernel_specs::SpecsError;

use crate::scan::ScanError;

pub use build::build_link_graph;
pub(crate) use build::build_link_graph_with;

/// Why building the link graph failed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GraphError {
    /// A workspace manifest or a Rust source could not be read or scanned.
    Scan(ScanError),
    /// A living spec could not be read.
    Specs(SpecsError),
}

impl fmt::Display for GraphError {
    /// Writes the message of the error this one holds.
    ///
    /// Implements: rust-linter/link-graph-build
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Scan(error) => error.fmt(formatter),
            Self::Specs(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for GraphError {
    /// Returns the error this one holds.
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Scan(error) => Some(error),
            Self::Specs(error) => Some(error),
        }
    }
}
