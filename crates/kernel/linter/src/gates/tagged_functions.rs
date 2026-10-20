//! The `tagged-functions` link rule.

use osq_core::{EdgeKind, Finding, Graph, NodeId, Rule};

/// The fix for a public function with no `Implements:` tag.
const FIX: &str = "End its doc with Implements: <capability>/<requirement name in kebab-case>.";

/// Reports each public function in crate code with no `Implements:` tag.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaggedFunctions;

impl Rule for TaggedFunctions {
    /// The rule's name.
    ///
    /// Implements: rust-linter/link-gates
    fn name(&self) -> &'static str {
        "tagged-functions"
    }

    /// One finding per untagged public function, in id order.
    ///
    /// Implements: rust-linter/link-gates
    fn check(&self, graph: &Graph) -> Vec<Finding> {
        let mut findings = Vec::new();
        for node in graph.nodes() {
            if !matches!(node.id, NodeId::Item(_)) || !node.public || !node.function {
                continue;
            }
            let Some(location) = &node.location else {
                continue;
            };
            if !in_crate_code(&location.file) {
                continue;
            }
            if graph
                .edges_from(&node.id)
                .any(|edge| edge.kind == EdgeKind::Implements)
            {
                continue;
            }
            findings.push(Finding {
                rule: self.name().to_owned(),
                node: node.id.clone(),
                location: node.location.clone(),
                message: format!("public function {} has no Implements: tag", node.name),
                fix: FIX.to_owned(),
            });
        }
        findings
    }
}

/// Whether a path has a `src` folder and no `tests` folder.
fn in_crate_code(file: &str) -> bool {
    let mut src = false;
    let mut tests = false;
    for folder in file.split('/') {
        src |= folder == "src";
        tests |= folder == "tests";
    }
    src && !tests
}
