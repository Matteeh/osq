//! The `live-references` link rule.

use osq_core::{Edge, EdgeKind, Finding, Graph, NodeId, Rule};

/// The fix for an `applies_to` edge that names nothing.
const APPLIES_FIX: &str = "Name a living capability, or a group as group:<name>.";
/// The fix for a reference that names an ADR that is not accepted.
const ADR_FIX: &str = "Name an accepted ADR.";
/// The fix for an `Implements:` tag that names nothing.
const IMPLEMENTS_FIX: &str =
    "Name a living requirement as <capability>/<requirement name in kebab-case>.";
/// The fix for a `Covers:` tag that names nothing.
const COVERS_FIX: &str = "Name a living scenario as <capability>/<scenario name in kebab-case>.";

/// The named end of an edge, the end a finding is about, the word and the fix.
struct Checked {
    /// The end the edge names.
    named: NodeId,
    /// The other end, which the finding is about.
    other: NodeId,
    /// The word the message writes for the edge.
    word: &'static str,
    /// The fix for a broken reference.
    fix: &'static str,
}

/// Reports each reference to a node that does not exist or is not live.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LiveReferences;

impl Rule for LiveReferences {
    /// The rule's name.
    ///
    /// Implements: rust-linter/link-gates
    fn name(&self) -> &'static str {
        "live-references"
    }

    /// One finding per broken reference, in edge order.
    ///
    /// Implements: rust-linter/link-gates
    fn check(&self, graph: &Graph) -> Vec<Finding> {
        let mut findings = Vec::new();
        for edge in graph.edges() {
            let Some(checked) = checked(edge) else {
                continue;
            };
            if edge.kind == EdgeKind::Governs && matches!(edge.to, NodeId::Capability(_)) {
                continue;
            }
            let Some(message) = problem(graph, &checked.named, checked.word) else {
                continue;
            };
            findings.push(Finding {
                rule: self.name().to_owned(),
                node: checked.other,
                location: edge.location.clone(),
                message,
                fix: checked.fix.to_owned(),
            });
        }
        findings
    }
}

/// The parts a checked edge kind states, or none for a kind not checked.
fn checked(edge: &Edge) -> Option<Checked> {
    let (named, other, word, fix) = match edge.kind {
        EdgeKind::AppliesTo => (&edge.to, &edge.from, "applies_to", APPLIES_FIX),
        EdgeKind::Supersedes => (&edge.from, &edge.to, "superseded_by", ADR_FIX),
        EdgeKind::Governs => (&edge.from, &edge.to, "Adr: tag", ADR_FIX),
        EdgeKind::Implements => (&edge.to, &edge.from, "Implements: tag", IMPLEMENTS_FIX),
        EdgeKind::Covers => (&edge.to, &edge.from, "Covers: tag", COVERS_FIX),
        _ => return None,
    };
    Some(Checked {
        named: named.clone(),
        other: other.clone(),
        word,
        fix,
    })
}

/// Why the named id is not live, or none when it is.
fn problem(graph: &Graph, named: &NodeId, word: &str) -> Option<String> {
    match graph.node(named) {
        None => Some(format!("{word} names {named}, which does not exist")),
        Some(node)
            if matches!(named, NodeId::Adr(_)) && node.status.as_deref() != Some("accepted") =>
        {
            let status = node.status.as_deref().unwrap_or_default();
            Some(format!("{word} names {named}, which is {status}"))
        }
        Some(_) => None,
    }
}
