//! Link rule cases the fixture project cannot reach.

use osq_core::{Edge, EdgeKind, Graph, Location, Node, NodeId, Rule};
use osq_kernel_linter::{
    CompleteCapabilities, LiveReferences, OwnedOnce, ScopedCapability, TaggedFunctions,
};

/// A graph holding the nodes and edges given.
fn graph(nodes: Vec<Node>, edges: Vec<Edge>) -> Graph {
    let mut graph = Graph::default();
    for node in nodes {
        let _ = graph.add_node(node);
    }
    for edge in edges {
        graph.add_edge(edge);
    }
    graph
}

/// A node with the fields a rule reads.
fn node(id: NodeId, name: &str, file: Option<&str>, line: Option<usize>) -> Node {
    Node {
        id,
        name: name.to_owned(),
        location: file.map(|file| Location {
            file: file.to_owned(),
            line,
        }),
        status: None,
        public: false,
        function: false,
    }
}

/// A public function item node in `file` at `line`.
fn public_function(key: &str, name: &str, file: &str, line: usize) -> Node {
    Node {
        public: true,
        function: true,
        ..node(NodeId::Item(key.to_owned()), name, Some(file), Some(line))
    }
}

/// An edge of one kind between two ids, with no location.
fn edge(kind: EdgeKind, from: NodeId, to: NodeId) -> Edge {
    Edge {
        kind,
        from,
        to,
        location: None,
    }
}

/// A file node with no location.
fn file(key: &str) -> Node {
    node(NodeId::File(key.to_owned()), key, Some(key), None)
}

/// An accepted ADR node.
fn adr(key: &str) -> Node {
    Node {
        status: Some("accepted".to_owned()),
        ..node(
            NodeId::Adr(key.to_owned()),
            key,
            Some("decisions/a.md"),
            None,
        )
    }
}

/// Covers: rust-linter/findings-of-the-link-gates-fixture
#[test]
fn owned_once_counts_only_capability_owners() {
    let target = NodeId::File("src/a.rs".to_owned());
    let graph = graph(
        vec![
            file("src/a.rs"),
            node(NodeId::Capability("alpha".to_owned()), "alpha", None, None),
            node(NodeId::Adr("001".to_owned()), "001", None, None),
        ],
        vec![edge(EdgeKind::Owns, NodeId::Adr("001".to_owned()), target)],
    );
    let findings = OwnedOnce.check(&graph);
    assert_eq!(1, findings.len());
    assert_eq!("owned by no capability", findings[0].message);
    assert_eq!(
        Some("src/a.rs"),
        findings[0].location.as_ref().map(|l| l.file.as_str())
    );
}

/// Covers: rust-linter/findings-of-the-link-gates-fixture
#[test]
fn complete_capabilities_skips_capabilities_without_a_node() {
    let rule = CompleteCapabilities {
        capabilities: vec![
            ScopedCapability {
                name: "ghost".to_owned(),
                purpose: false,
            },
            ScopedCapability {
                name: "alpha".to_owned(),
                purpose: true,
            },
        ],
    };
    let graph = graph(
        vec![
            node(
                NodeId::Capability("alpha".to_owned()),
                "alpha",
                Some("a.md"),
                None,
            ),
            node(
                NodeId::Requirement("alphax/one".to_owned()),
                "One",
                Some("a.md"),
                None,
            ),
        ],
        vec![edge(
            EdgeKind::Owns,
            NodeId::Capability("alpha".to_owned()),
            NodeId::File("src/a.rs".to_owned()),
        )],
    );
    let findings = rule.check(&graph);
    assert_eq!(1, findings.len());
    assert_eq!("alpha has no requirement", findings[0].message);
}

/// Covers: rust-linter/findings-of-the-link-gates-fixture
#[test]
fn live_references_skips_capability_governs_and_live_edges() {
    let graph = graph(
        vec![
            adr("001"),
            node(
                NodeId::Item("src/a.rs::f".to_owned()),
                "f",
                Some("src/a.rs"),
                Some(1),
            ),
            node(
                NodeId::Requirement("alpha/one".to_owned()),
                "One",
                Some("a.md"),
                None,
            ),
        ],
        vec![
            edge(
                EdgeKind::Governs,
                NodeId::Adr("001".to_owned()),
                NodeId::Capability("ghost".to_owned()),
            ),
            edge(
                EdgeKind::Governs,
                NodeId::Item("src/a.rs::f".to_owned()),
                NodeId::Item("src/a.rs::f".to_owned()),
            ),
            edge(
                EdgeKind::Supersedes,
                NodeId::Adr("001".to_owned()),
                NodeId::Adr("001".to_owned()),
            ),
            edge(
                EdgeKind::Implements,
                NodeId::Item("src/a.rs::f".to_owned()),
                NodeId::Requirement("alpha/one".to_owned()),
            ),
        ],
    );
    assert_eq!(0, LiveReferences.check(&graph).len());
}

/// Covers: rust-linter/findings-of-the-link-gates-fixture
#[test]
fn tagged_functions_skips_tests_folders_and_untagged_items() {
    let graph = graph(
        vec![
            public_function("a::none", "none", "src/none.rs", 1),
            public_function("e::elsewhere", "elsewhere", "lib/elsewhere.rs", 5),
            public_function("b::both", "both", "crates/x/tests/src/lib.rs", 2),
            public_function("c::tagged", "tagged", "src/tagged.rs", 3),
            node(
                NodeId::Item("d::plain".to_owned()),
                "plain",
                Some("src/plain.rs"),
                Some(4),
            ),
        ],
        vec![edge(
            EdgeKind::Implements,
            NodeId::Item("c::tagged".to_owned()),
            NodeId::Requirement("alpha/one".to_owned()),
        )],
    );
    let findings = TaggedFunctions.check(&graph);
    let names: Vec<&str> = findings
        .iter()
        .map(|finding| finding.message.as_str())
        .collect();
    assert_eq!(vec!["public function none has no Implements: tag"], names);
    assert_eq!(
        "public function none has no Implements: tag",
        findings[0].message
    );
}
