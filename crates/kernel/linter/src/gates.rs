//! Link gates: the four ADR 024 rules that hold for a repository as a whole.

mod complete_capabilities;
mod live_references;
mod owned_once;
mod tagged_functions;

use std::fs;
use std::path::Path;

use osq_core::{Finding, Graph, Node, NodeId, run_rules, tag_id};
use osq_kernel_specs::{Requirement, read_decisions, read_delta, read_living_spec};

use crate::graph::{GraphError, build_link_graph};

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

/// Runs the four link rules over a project and the change in flight at `change`.
///
/// The change is joined onto `root`. Each `spec.md` directly under its `specs`
/// folder adds the requirements its delta ADDS or MODIFIES and each name it
/// RENAMES to, and the scenarios of an ADDED or MODIFIED requirement, so a tag
/// naming what the change adds counts as live.
///
/// # Errors
///
/// Returns the `GraphError` building the link graph, reading a living spec or
/// reading a delta gives.
///
/// Implements: rust-linter/link-gates
pub fn change_link_gates(
    root: &Path,
    decisions: &Path,
    openspec: &Path,
    group: &str,
    change: &Path,
) -> Result<Vec<Finding>, GraphError> {
    let mut graph = build_link_graph(root, decisions, openspec)?;
    add_delta_nodes(&mut graph, &root.join(change))?;
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

/// Adds the requirement and scenario nodes a change's deltas make live.
fn add_delta_nodes(graph: &mut Graph, change: &Path) -> Result<(), GraphError> {
    let specs = change.join("specs");
    for capability in folder_names(&specs) {
        let path = specs.join(&capability).join("spec.md");
        if !path.is_file() {
            continue;
        }
        let delta = read_delta(&path).map_err(GraphError::Specs)?;
        add_requirements(graph, &capability, &delta.added);
        add_requirements(graph, &capability, &delta.modified);
        for rename in &delta.renamed {
            add_requirement(graph, &capability, &rename.to);
        }
    }
    Ok(())
}

/// Adds a requirement node and its scenario nodes, keeping nodes already there.
fn add_requirements(graph: &mut Graph, capability: &str, requirements: &[Requirement]) {
    for requirement in requirements {
        add_requirement(graph, capability, &requirement.name);
        for scenario in &requirement.scenarios {
            let key = format!("{capability}/{}", tag_id(&scenario.name));
            let _ = graph.add_node(Node {
                id: NodeId::Scenario(key),
                name: scenario.name.clone(),
                location: None,
                status: None,
                public: false,
                function: false,
            });
        }
    }
}

/// Adds a requirement node with no location, keeping a node already there.
fn add_requirement(graph: &mut Graph, capability: &str, name: &str) {
    let key = format!("{capability}/{}", tag_id(name));
    let _ = graph.add_node(Node {
        id: NodeId::Requirement(key),
        name: name.to_owned(),
        location: None,
        status: None,
        public: false,
        function: false,
    });
}

/// The names of the folders directly under a directory, in byte order.
fn folder_names(directory: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(directory) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
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
