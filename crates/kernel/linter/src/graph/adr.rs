//! ADR nodes and the edges the decision records state.

use osq_core::{Edge, EdgeKind, Graph, Location, Node, NodeId};
use osq_kernel_specs::{Adr, AppliesTo, DecisionRecords};

use super::specs::Capability;

/// Adds one node per ADR and the ADR edges in read order.
pub(super) fn add(graph: &mut Graph, records: &DecisionRecords, capabilities: &[Capability]) {
    for adr in &records.adrs {
        let _ = graph.add_node(Node {
            id: NodeId::Adr(adr.number.clone()),
            name: adr.title.clone(),
            location: Some(Location {
                file: adr.path.clone(),
                line: None,
            }),
            status: Some(adr.status.clone()),
            public: false,
            function: false,
        });
    }
    for adr in &records.adrs {
        let location = Location {
            file: adr.path.clone(),
            line: None,
        };
        applies_to_edges(graph, adr, &location);
        governs_edges(graph, adr, capabilities, &location);
        supersedes_edge(graph, records, adr, &location);
    }
}

/// Adds an `applies_to` edge per entry of the ADR's `applies_to`.
fn applies_to_edges(graph: &mut Graph, adr: &Adr, location: &Location) {
    let Some(AppliesTo::Capabilities(entries)) = &adr.applies_to else {
        return;
    };
    for entry in entries {
        let to = match entry.strip_prefix("group:") {
            Some(group) => NodeId::Group(group.to_owned()),
            None => NodeId::Capability(entry.clone()),
        };
        push_edge(
            graph,
            EdgeKind::AppliesTo,
            NodeId::Adr(adr.number.clone()),
            to,
            location,
        );
    }
}

/// Adds a `governs` edge to each capability the ADR governs.
fn governs_edges(graph: &mut Graph, adr: &Adr, capabilities: &[Capability], location: &Location) {
    let from = NodeId::Adr(adr.number.clone());
    match &adr.governs {
        AppliesTo::All => {
            for capability in capabilities {
                push_edge(
                    graph,
                    EdgeKind::Governs,
                    from.clone(),
                    NodeId::Capability(capability.name.clone()),
                    location,
                );
            }
        }
        AppliesTo::Capabilities(names) => {
            for name in names {
                push_edge(
                    graph,
                    EdgeKind::Governs,
                    from.clone(),
                    NodeId::Capability(name.clone()),
                    location,
                );
            }
        }
    }
}

/// Adds the `supersedes` edge from the ADR that replaces this one.
fn supersedes_edge(graph: &mut Graph, records: &DecisionRecords, adr: &Adr, location: &Location) {
    let Some(target) = &adr.superseded_by else {
        return;
    };
    let from = NodeId::Adr(resolve(&records.adrs, target));
    push_edge(
        graph,
        EdgeKind::Supersedes,
        from,
        NodeId::Adr(adr.number.clone()),
        location,
    );
}

/// Resolves a number to the first ADR whose number has the same value.
///
/// A number that is not all ASCII digits, or names no ADR, stays as written.
pub(super) fn resolve(adrs: &[Adr], target: &str) -> String {
    let Some(adr) = adrs.iter().find(|adr| same_number(&adr.number, target)) else {
        return target.to_owned();
    };
    adr.number.clone()
}

/// Whether two numbers name the same value when both are all ASCII digits.
fn same_number(left: &str, right: &str) -> bool {
    digits(left) && digits(right) && trim_zeros(left) == trim_zeros(right)
}

/// Whether a number is one or more ASCII digits.
fn digits(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit())
}

/// Drops the leading zeros of a number, keeping zero itself empty.
fn trim_zeros(value: &str) -> &str {
    value.trim_start_matches('0')
}

/// Adds one edge at the ADR's place.
fn push_edge(graph: &mut Graph, kind: EdgeKind, from: NodeId, to: NodeId, location: &Location) {
    graph.add_edge(Edge {
        kind,
        from,
        to,
        location: Some(location.clone()),
    });
}
