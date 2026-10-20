//! The link graph builder: reads a project's folders and joins their nodes.

use std::path::Path;

use osq_core::Graph;
use osq_kernel_specs::read_decisions;

use super::GraphError;
use super::{adr, files, specs};

/// Builds ADR 024's link graph for the project at `root`.
///
/// `decisions` and `openspec` are the project-relative folders of the ADRs and
/// the living specs. A missing folder adds no nodes.
///
/// # Errors
///
/// Returns `GraphError::Scan` when the workspace manifest or a Rust source
/// cannot be read or scanned, and `GraphError::Specs` when a living spec
/// cannot be read.
///
/// Implements: rust-linter/link-graph-build
pub fn build_link_graph(
    root: &Path,
    decisions: &Path,
    openspec: &Path,
) -> Result<Graph, GraphError> {
    let records = read_decisions(root, decisions, openspec);
    let capabilities = specs::read(root, openspec)?;
    let mut graph = Graph::default();
    adr::add(&mut graph, &records, &capabilities);
    specs::add(&mut graph, &capabilities, &records);
    files::add(&mut graph, root, &records.adrs)?;
    files::add_ownership(&mut graph, root, openspec);
    Ok(graph)
}
