//! The link gates with the change in flight as an input.

use std::fs;
use std::path::Path;

use osq_core::{Finding, Graph, Node, NodeId, tag_id};
use osq_kernel_specs::{
    CapabilityOwnership, Delta, Requirement, code_ownership, read_capability_ownership, read_delta,
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
/// requirement, so a tag naming what the change adds counts as live.
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
    let ownerships = merge_ownership(root, openspec, &deltas);
    let mut graph = build_link_graph_with(root, decisions, openspec, &ownerships)?;
    add_delta_nodes(&mut graph, &deltas);
    super::run_link_rules(root, decisions, openspec, group, &graph)
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
fn merge_ownership(
    root: &Path,
    openspec: &Path,
    deltas: &[CapabilityDelta],
) -> Vec<CapabilityOwnership> {
    let mut ownerships = read_capability_ownership(&root.join(openspec).join("specs"));
    for entry in deltas {
        let Some(globs) = delta_ownership(&entry.delta) else {
            continue;
        };
        match ownerships
            .iter_mut()
            .find(|ownership| ownership.capability == entry.capability)
        {
            Some(ownership) => ownership.globs = globs,
            None => ownerships.push(CapabilityOwnership {
                capability: entry.capability.clone(),
                globs,
            }),
        }
    }
    ownerships.sort_by(|left, right| left.capability.cmp(&right.capability));
    ownerships
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
