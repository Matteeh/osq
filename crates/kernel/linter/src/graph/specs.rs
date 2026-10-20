//! Capability, requirement, scenario and group nodes.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use osq_core::{Graph, Location, Node, NodeId, tag_id};
use osq_kernel_specs::{DecisionRecords, LivingSpec, read_living_spec};

use super::GraphError;
use crate::workspace::relative_slash_path;

/// One living capability read from disk.
pub(super) struct Capability {
    /// The capability's folder name.
    pub(super) name: String,
    /// The parsed living spec.
    pub(super) spec: LivingSpec,
    /// Where the living spec is stated.
    pub(super) location: Location,
}

/// Reads every folder directly under `<openspec>/specs` that holds a `spec.md`.
pub(super) fn read(root: &Path, openspec: &Path) -> Result<Vec<Capability>, GraphError> {
    let specs = root.join(openspec).join("specs");
    let mut capabilities = Vec::new();
    for name in folder_names(&specs) {
        let path = specs.join(&name).join("spec.md");
        if !path.is_file() {
            continue;
        }
        let spec = read_living_spec(&path).map_err(GraphError::Specs)?;
        let location = Location {
            file: relative_slash_path(root, &path),
            line: None,
        };
        capabilities.push(Capability {
            name,
            spec,
            location,
        });
    }
    Ok(capabilities)
}

/// Adds the capability, requirement, scenario and group nodes.
pub(super) fn add(graph: &mut Graph, capabilities: &[Capability], records: &DecisionRecords) {
    for capability in capabilities {
        let _ = graph.add_node(Node {
            id: NodeId::Capability(capability.name.clone()),
            name: capability.name.clone(),
            location: Some(capability.location.clone()),
            status: None,
            public: false,
            function: false,
        });
        for requirement in &capability.spec.requirements {
            let key = format!("{}/{}", capability.name, tag_id(&requirement.name));
            let _ = graph.add_node(Node {
                id: NodeId::Requirement(key.clone()),
                name: requirement.name.clone(),
                location: Some(capability.location.clone()),
                status: None,
                public: false,
                function: false,
            });
            for scenario in &requirement.scenarios {
                let key = format!("{}/{}", capability.name, tag_id(&scenario.name));
                let _ = graph.add_node(Node {
                    id: NodeId::Scenario(key),
                    name: scenario.name.clone(),
                    location: Some(capability.location.clone()),
                    status: None,
                    public: false,
                    function: false,
                });
            }
        }
    }
    add_groups(graph, records);
}

/// The place the capability's living spec states.
pub(super) fn location(root: &Path, openspec: &Path, capability: &str) -> String {
    relative_slash_path(
        root,
        &root
            .join(openspec)
            .join("specs")
            .join(capability)
            .join("spec.md"),
    )
}

/// Adds one group node per distinct sidecar group, in byte order.
fn add_groups(graph: &mut Graph, records: &DecisionRecords) {
    let groups: BTreeSet<&String> = records.groups.values().collect();
    for group in groups {
        let _ = graph.add_node(Node {
            id: NodeId::Group(group.clone()),
            name: group.clone(),
            location: None,
            status: None,
            public: false,
            function: false,
        });
    }
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
