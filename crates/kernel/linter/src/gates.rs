//! Link gates: the four ADR 024 rules that hold for a repository as a whole.

mod change;
mod complete_capabilities;
mod live_references;
mod owned_once;
mod tagged_functions;

use std::path::Path;

use osq_core::{Finding, Graph, NodeId, run_rules};
use osq_kernel_specs::{read_decisions, read_living_spec};

use crate::graph::{GraphError, build_link_graph};

pub use change::change_link_gates;
pub use complete_capabilities::{CompleteCapabilities, ScopedCapability};
pub use live_references::LiveReferences;
pub use owned_once::OwnedOnce;
pub use tagged_functions::TaggedFunctions;

/// Runs the four link rules over the project at `root`.
///
/// `decisions` and `openspec` are the project-relative folders of the ADRs and
/// the living specs, and `complete-capabilities` checks only the capabilities
/// whose sidecar group is `group`.
///
/// # Errors
///
/// Returns the `GraphError` building the link graph or reading a living spec
/// gives.
///
/// Implements: rust-linter/link-gates
pub fn link_gates(
    root: &Path,
    decisions: &Path,
    openspec: &Path,
    group: &str,
) -> Result<Vec<Finding>, GraphError> {
    let graph = build_link_graph(root, decisions, openspec)?;
    run_link_rules(root, decisions, openspec, group, &graph)
}

/// Runs the four link rules over a graph, scoping `complete-capabilities`.
fn run_link_rules(
    root: &Path,
    decisions: &Path,
    openspec: &Path,
    group: &str,
    graph: &Graph,
) -> Result<Vec<Finding>, GraphError> {
    let records = read_decisions(root, decisions, openspec);
    let capabilities = scoped_capabilities(root, openspec, group, graph, &records.groups)?;
    let owned_once = OwnedOnce;
    let complete = CompleteCapabilities { capabilities };
    let live = LiveReferences;
    let tagged = TaggedFunctions;
    Ok(run_rules(graph, &[&owned_once, &complete, &live, &tagged]))
}

/// The capabilities of `group` that have a node, in id order, with their Purpose.
fn scoped_capabilities(
    root: &Path,
    openspec: &Path,
    group: &str,
    graph: &osq_core::Graph,
    groups: &std::collections::BTreeMap<String, String>,
) -> Result<Vec<ScopedCapability>, GraphError> {
    let specs = root.join(openspec).join("specs");
    let mut capabilities = Vec::new();
    for node in graph.nodes() {
        let NodeId::Capability(name) = &node.id else {
            continue;
        };
        if groups.get(name).map(String::as_str) != Some(group) {
            continue;
        }
        let spec =
            read_living_spec(&specs.join(name).join("spec.md")).map_err(GraphError::Specs)?;
        capabilities.push(ScopedCapability {
            name: name.clone(),
            purpose: !spec.purpose.is_empty(),
        });
    }
    Ok(capabilities)
}
