//! The `owned-once` link rule.

use osq_core::{EdgeKind, Finding, Graph, NodeId, Rule};

/// The fix for a file no capability owns.
const ADD_FIX: &str = "Add the file to one capability's Code ownership globs.";
/// The fix for a file more than one capability owns.
const KEEP_FIX: &str = "Keep the file in one capability's Code ownership globs.";

/// Reports each file that no capability owns, or more than one does.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OwnedOnce;

impl Rule for OwnedOnce {
    /// The rule's name.
    ///
    /// Implements: rust-linter/link-gates
    fn name(&self) -> &'static str {
        "owned-once"
    }

    /// One finding per file with no owner or several, in id order.
    ///
    /// Implements: rust-linter/link-gates
    fn check(&self, graph: &Graph) -> Vec<Finding> {
        let mut findings = Vec::new();
        for node in graph.nodes() {
            if !matches!(node.id, NodeId::File(_)) {
                continue;
            }
            let owners = owners_of(graph, &node.id);
            let (message, fix) = match owners.len() {
                0 => ("owned by no capability".to_owned(), ADD_FIX),
                1 => continue,
                _ => (format!("owned by {}", owners.join(", ")), KEEP_FIX),
            };
            findings.push(Finding {
                rule: self.name().to_owned(),
                node: node.id.clone(),
                location: node.location.clone(),
                message,
                fix: fix.to_owned(),
            });
        }
        findings
    }
}

/// The capability names of the `owns` edges reaching `file`, in edge order.
fn owners_of<'a>(graph: &'a Graph, file: &NodeId) -> Vec<&'a str> {
    graph
        .edges_of(EdgeKind::Owns)
        .filter(|edge| edge.to == *file)
        .filter_map(|edge| match &edge.from {
            NodeId::Capability(name) => Some(name.as_str()),
            _ => None,
        })
        .collect()
}
