//! The `complete-capabilities` link rule.

use osq_core::{EdgeKind, Finding, Graph, NodeId, Rule};

/// The fix for a capability with no Purpose.
const PURPOSE_FIX: &str = "Write a Purpose section in the capability's spec.md.";
/// The fix for a capability with no requirement.
const REQUIREMENT_FIX: &str = "Add a requirement to the capability's spec.md.";
/// The fix for a capability that owns no file.
const OWNERSHIP_FIX: &str =
    "Add a Code ownership requirement whose globs cover the capability's files.";

/// One capability the rule checks, and whether its living spec has a Purpose.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScopedCapability {
    /// The capability's name.
    pub name: String,
    /// Whether that capability's living spec has a Purpose.
    pub purpose: bool,
}

/// Reports each scoped capability that lacks a Purpose, a requirement or a file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompleteCapabilities {
    /// The capabilities in scope, in the order they are checked.
    pub capabilities: Vec<ScopedCapability>,
}

impl Rule for CompleteCapabilities {
    /// The rule's name.
    ///
    /// Implements: rust-linter/link-gates
    fn name(&self) -> &'static str {
        "complete-capabilities"
    }

    /// One finding per gap, per capability, in the order held.
    ///
    /// Implements: rust-linter/link-gates
    fn check(&self, graph: &Graph) -> Vec<Finding> {
        let mut findings = Vec::new();
        for scoped in &self.capabilities {
            let id = NodeId::Capability(scoped.name.clone());
            let Some(node) = graph.node(&id) else {
                continue;
            };
            if !scoped.purpose {
                push(
                    &mut findings,
                    self.name(),
                    node,
                    format!("{} has no Purpose", scoped.name),
                    PURPOSE_FIX,
                );
            }
            if !has_requirement(graph, &scoped.name) {
                push(
                    &mut findings,
                    self.name(),
                    node,
                    format!("{} has no requirement", scoped.name),
                    REQUIREMENT_FIX,
                );
            }
            if !graph
                .edges_from(&id)
                .any(|edge| edge.kind == EdgeKind::Owns)
            {
                push(
                    &mut findings,
                    self.name(),
                    node,
                    format!("{} owns no file", scoped.name),
                    OWNERSHIP_FIX,
                );
            }
        }
        findings
    }
}

/// Whether a requirement node is keyed under `capability`.
fn has_requirement(graph: &Graph, capability: &str) -> bool {
    let prefix = format!("{capability}/");
    graph.nodes().any(|node| match &node.id {
        NodeId::Requirement(key) => key.starts_with(&prefix),
        _ => false,
    })
}

/// Adds one finding at the capability node's location.
fn push(
    findings: &mut Vec<Finding>,
    rule: &str,
    node: &osq_core::Node,
    message: String,
    fix: &str,
) {
    findings.push(Finding {
        rule: rule.to_owned(),
        node: node.id.clone(),
        location: node.location.clone(),
        message,
        fix: fix.to_owned(),
    });
}
