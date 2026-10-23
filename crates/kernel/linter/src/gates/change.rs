//! The link gates with the change in flight as an input.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use osq_core::{Finding, Graph, Node, NodeId, tag_id};
use osq_kernel_specs::{
    CapabilityOwnership, Delta, Requirement, code_ownership, read_capability_ownership, read_delta,
    read_living_spec,
};

use crate::graph::{GraphError, build_link_graph_with};

/// The requirement name whose delta replacement changes a capability's globs.
const OWNERSHIP: &str = "Code ownership";

/// One capability's delta spec, read once for both its ownership and its nodes.
struct CapabilityDelta {
    /// The capability folder's name.
    capability: String,
    /// The parsed delta.
    delta: Delta,
}

/// Runs the four link rules over a project and the change in flight at `change`.
///
/// The change is joined onto `root`. A capability whose delta ADDS or MODIFIES
/// `Code ownership` owns the globs that requirement states in place of its
/// living globs. Each delta also adds the requirements it ADDS or MODIFIES and
/// each name it RENAMES to, and the scenarios of an ADDED or MODIFIED
/// requirement, so a tag naming what the change adds counts as live. A
/// capability the change leaves with no requirement is left out of the graph,
/// as archive removes it.
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
    let deltas = read_deltas(&root.join(change))?;
    let emptied = emptied_capabilities(root, openspec, &deltas)?;
    let ownerships = merge_ownership(root, openspec, &deltas);
    let mut graph = build_link_graph_with(root, decisions, openspec, &ownerships)?;
    add_delta_nodes(&mut graph, &deltas);
    let graph = without_emptied(&graph, &emptied);
    super::run_link_rules(root, decisions, openspec, group, &graph)
}

/// The capabilities whose deltas leave them with no requirement.
///
/// Archive removes an emptied capability, so the change in flight leaves its
/// nodes out of the link graph too.
fn emptied_capabilities(
    root: &Path,
    openspec: &Path,
    deltas: &[CapabilityDelta],
) -> Result<Vec<String>, GraphError> {
    let specs = root.join(openspec).join("specs");
    let mut emptied = Vec::new();
    for entry in deltas {
        let path = specs.join(&entry.capability).join("spec.md");
        if !path.is_file() {
            continue;
        }
        let living = read_living_spec(&path).map_err(GraphError::Specs)?;
        let mut names: BTreeSet<String> = living
            .requirements
            .into_iter()
            .map(|requirement| requirement.name)
            .collect();
        apply_delta_names(&mut names, &entry.delta);
        if names.is_empty() {
            emptied.push(entry.capability.clone());
        }
    }
    Ok(emptied)
}

/// Applies a delta's additions, modifications, removals and renames to names.
fn apply_delta_names(names: &mut BTreeSet<String>, delta: &Delta) {
    for name in &delta.removed {
        names.remove(name);
    }
    for requirement in delta.added.iter().chain(delta.modified.iter()) {
        names.insert(requirement.name.clone());
    }
    for rename in &delta.renamed {
        names.remove(&rename.from);
        names.insert(rename.to.clone());
    }
}

/// A copy of the graph with every emptied capability's nodes and edges left out.
fn without_emptied(graph: &Graph, emptied: &[String]) -> Graph {
    let mut filtered = Graph::default();
    for node in graph.nodes() {
        if !in_emptied(&node.id, emptied) {
            let _ = filtered.add_node(node.clone());
        }
    }
    for edge in graph.edges() {
        if !in_emptied(&edge.from, emptied) && !in_emptied(&edge.to, emptied) {
            filtered.add_edge(edge.clone());
        }
    }
    filtered
}

/// True when an id is a capability the change empties.
fn in_emptied(id: &NodeId, emptied: &[String]) -> bool {
    matches!(id, NodeId::Capability(name) if emptied.contains(name))
}

/// Reads each `spec.md` directly under the change's `specs` folder, in byte order.
fn read_deltas(change: &Path) -> Result<Vec<CapabilityDelta>, GraphError> {
    let specs = change.join("specs");
    let mut deltas = Vec::new();
    for capability in folder_names(&specs) {
        let path = specs.join(&capability).join("spec.md");
        if !path.is_file() {
            continue;
        }
        let delta = read_delta(&path).map_err(GraphError::Specs)?;
        deltas.push(CapabilityDelta { capability, delta });
    }
    Ok(deltas)
}

/// The living globs with each delta's `Code ownership` in place, in byte order.
///
/// A capability whose delta REMOVES `Code ownership` and states no replacement
/// is left with no globs, as archive will leave it.
fn merge_ownership(
    root: &Path,
    openspec: &Path,
    deltas: &[CapabilityDelta],
) -> Vec<CapabilityOwnership> {
    let mut ownerships = read_capability_ownership(&root.join(openspec).join("specs"));
    for entry in deltas {
        if let Some(globs) = delta_ownership(&entry.delta) {
            set_ownership(&mut ownerships, &entry.capability, globs);
        } else if removes_ownership(&entry.delta) {
            ownerships.retain(|ownership| ownership.capability != entry.capability);
        }
    }
    ownerships.sort_by(|left, right| left.capability.cmp(&right.capability));
    ownerships
}

/// Gives a capability its globs, adding it when it has no living ownership.
fn set_ownership(ownerships: &mut Vec<CapabilityOwnership>, capability: &str, globs: Vec<String>) {
    match ownerships
        .iter_mut()
        .find(|ownership| ownership.capability == capability)
    {
        Some(ownership) => ownership.globs = globs,
        None => ownerships.push(CapabilityOwnership {
            capability: capability.to_owned(),
            globs,
        }),
    }
}

/// True when a delta REMOVES a `Code ownership` requirement.
fn removes_ownership(delta: &Delta) -> bool {
    delta.removed.iter().any(|name| name == OWNERSHIP)
}

/// The globs an ADDED or MODIFIED `Code ownership` requirement states, or none.
fn delta_ownership(delta: &Delta) -> Option<Vec<String>> {
    delta
        .added
        .iter()
        .chain(delta.modified.iter())
        .find(|requirement| requirement.name == OWNERSHIP)
        .map(|requirement| code_ownership(&requirement.raw))
}

/// Adds the requirement and scenario nodes the read deltas make live.
fn add_delta_nodes(graph: &mut Graph, deltas: &[CapabilityDelta]) {
    for entry in deltas {
        add_requirements(graph, &entry.capability, &entry.delta.added);
        add_requirements(graph, &entry.capability, &entry.delta.modified);
        for rename in &entry.delta.renamed {
            add_requirement(graph, &entry.capability, &rename.to);
        }
    }
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
