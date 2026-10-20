//! Proves ADR 024's link graph: ids, displays, queries, tag ids and rules.

use osq_core::{Edge, EdgeKind, Finding, Graph, Location, Node, NodeId, Rule, run_rules, tag_id};

/// A location without a line.
fn at(file: &str) -> Location {
    Location {
        file: file.to_owned(),
        line: None,
    }
}

/// A location with a line.
fn at_line(file: &str, line: usize) -> Location {
    Location {
        file: file.to_owned(),
        line: Some(line),
    }
}

/// A node with no location or status, and not public.
fn node(id: NodeId, name: &str) -> Node {
    Node {
        id,
        name: name.to_owned(),
        location: None,
        status: None,
        public: false,
        function: false,
    }
}

/// Adds the four nodes of "Graph queries" and gives the `add_node` results.
fn query_nodes(graph: &mut Graph) -> [bool; 4] {
    [
        graph.add_node(node(NodeId::Capability("a".to_owned()), "a")),
        graph.add_node(node(NodeId::Item("src/lib.rs::f".to_owned()), "f")),
        graph.add_node(node(NodeId::Requirement("a/one".to_owned()), "One")),
        graph.add_node(node(NodeId::Capability("a".to_owned()), "other")),
    ]
}

/// Adds the four edges of "Graph queries" and gives them in added order.
fn query_edges(graph: &mut Graph) -> [Edge; 4] {
    let item = NodeId::Item("src/lib.rs::f".to_owned());
    let one = NodeId::Requirement("a/one".to_owned());
    let two = NodeId::Requirement("a/two".to_owned());
    let capability = NodeId::Capability("a".to_owned());
    let file = NodeId::File("src/lib.rs".to_owned());
    let first = Edge {
        kind: EdgeKind::Implements,
        from: item.clone(),
        to: one.clone(),
        location: Some(at_line("src/lib.rs", 3)),
    };
    let second = Edge {
        kind: EdgeKind::Implements,
        from: item.clone(),
        to: two,
        location: Some(at_line("src/lib.rs", 4)),
    };
    let third = Edge {
        kind: EdgeKind::Owns,
        from: capability.clone(),
        to: file,
        location: None,
    };
    let fourth = Edge {
        kind: EdgeKind::Implements,
        from: item,
        to: one,
        location: Some(at_line("src/lib.rs", 3)),
    };
    let edges = [first, second, third, fourth];
    for edge in &edges {
        graph.add_edge(edge.clone());
    }
    edges
}

/// The graph of "Graph queries".
fn query_graph() -> Graph {
    let mut graph = Graph::default();
    query_nodes(&mut graph);
    query_edges(&mut graph);
    graph
}

/// Proves each node id displays as its prefix, a colon and its key, and that
/// the ids sort in variant order.
///
/// Covers: rust-core/node-id-display
#[test]
fn node_id_display() {
    let ids = vec![
        NodeId::Adr("024".to_owned()),
        NodeId::Capability("rust-core".to_owned()),
        NodeId::Group("rust".to_owned()),
        NodeId::Requirement("rust-core/link-graph".to_owned()),
        NodeId::Scenario("rust-core/node-id-display".to_owned()),
        NodeId::File("crates/core/src/lib.rs".to_owned()),
        NodeId::Item("crates/core/src/seal.rs::compute_seal".to_owned()),
        NodeId::Test("crates/core/tests/fold.rs::folds".to_owned()),
        NodeId::Change("231".to_owned()),
    ];
    let displays: Vec<String> = ids.iter().map(ToString::to_string).collect();
    assert_eq!(
        displays,
        [
            "adr:024",
            "capability:rust-core",
            "group:rust",
            "requirement:rust-core/link-graph",
            "scenario:rust-core/node-id-display",
            "file:crates/core/src/lib.rs",
            "item:crates/core/src/seal.rs::compute_seal",
            "test:crates/core/tests/fold.rs::folds",
            "change:231",
        ]
    );
    let mut sorted = ids.clone();
    sorted.sort();
    assert_eq!(sorted, ids);
}

/// Proves each edge kind gives its name.
///
/// Covers: rust-core/edge-kind-names
#[test]
fn edge_kind_names() {
    let cases = [
        (EdgeKind::AppliesTo, "applies_to"),
        (EdgeKind::Governs, "governs"),
        (EdgeKind::Owns, "owns"),
        (EdgeKind::Implements, "implements"),
        (EdgeKind::Covers, "covers"),
        (EdgeKind::Reads, "reads"),
        (EdgeKind::Writes, "writes"),
        (EdgeKind::Supersedes, "supersedes"),
        (EdgeKind::Departs, "departs"),
    ];
    for (kind, name) in cases {
        assert_eq!(kind.as_str(), name, "{kind:?}");
    }
}

/// Proves a location displays with its line, or without it.
///
/// Covers: rust-core/location-display
#[test]
fn location_display() {
    assert_eq!(at_line("src/lib.rs", 3).to_string(), "src/lib.rs:3");
    assert_eq!(at("decisions/001-a.md").to_string(), "decisions/001-a.md");
}

/// Proves the graph's nodes and edges, its queries and its dangling edges.
///
/// Covers: rust-core/graph-queries
#[test]
fn graph_queries() {
    let mut graph = Graph::default();
    let added = query_nodes(&mut graph);
    let edges = query_edges(&mut graph);
    assert_eq!(added, [true, true, true, false], "add_node results");

    let capability = NodeId::Capability("a".to_owned());
    let file = NodeId::File("src/lib.rs".to_owned());
    let item = NodeId::Item("src/lib.rs::f".to_owned());
    let one = NodeId::Requirement("a/one".to_owned());
    assert_eq!(
        graph.node(&capability).map(|found| found.name.as_str()),
        Some("a")
    );
    assert_eq!(graph.node(&file), None);

    let names: Vec<String> = graph.nodes().map(|found| found.id.to_string()).collect();
    assert_eq!(
        names,
        ["capability:a", "requirement:a/one", "item:src/lib.rs::f",]
    );
    assert_eq!(graph.edges().cloned().collect::<Vec<_>>(), edges.to_vec());
    assert_eq!(
        graph.edges_of(EdgeKind::Implements).collect::<Vec<_>>(),
        vec![&edges[0], &edges[1], &edges[3]]
    );
    assert_eq!(
        graph.edges_of(EdgeKind::Owns).collect::<Vec<_>>(),
        vec![&edges[2]]
    );
    assert_eq!(graph.edges_of(EdgeKind::Covers).count(), 0);
    assert_eq!(
        graph.edges_from(&item).collect::<Vec<_>>(),
        vec![&edges[0], &edges[1], &edges[3]]
    );
    assert_eq!(
        graph.edges_to(&one).collect::<Vec<_>>(),
        vec![&edges[0], &edges[3]]
    );
    assert_eq!(graph.edges_to(&capability).count(), 0);
    assert_eq!(
        graph.dangling().collect::<Vec<_>>(),
        vec![&edges[1], &edges[2]]
    );
}

/// Proves an edge whose `from` names no node is dangling too.
///
/// Covers: rust-core/graph-queries
#[test]
fn graph_queries_dangling_from() {
    let mut graph = Graph::default();
    let existing = NodeId::Requirement("a/one".to_owned());
    let _ = graph.add_node(node(existing.clone(), "One"));
    let edge = Edge {
        kind: EdgeKind::Covers,
        from: NodeId::Scenario("a/missing".to_owned()),
        to: existing,
        location: None,
    };
    graph.add_edge(edge.clone());
    assert_eq!(graph.dangling().collect::<Vec<_>>(), vec![&edge]);
}

/// Proves each name becomes its kebab-case id.
///
/// Covers: rust-core/tag-id-cases
#[test]
fn tag_id_cases() {
    let cases = [
        ("Code ownership", "code-ownership"),
        ("ADR records", "adr-records"),
        ("Core does no IO", "core-does-no-io"),
        ("Event lines round-trip", "event-lines-round-trip"),
        ("Rust CI parity job", "rust-ci-parity-job"),
        ("  Spaced -- out!  ", "spaced-out"),
        ("Café menu 2", "caf-menu-2"),
        ("already-kebab", "already-kebab"),
        ("", ""),
    ];
    for (name, id) in cases {
        assert_eq!(tag_id(name), id, "{name:?}");
    }
}

/// A rule that reports each dangling edge, as "Rules run in order" writes it.
struct Dangling;

impl Rule for Dangling {
    fn name(&self) -> &'static str {
        "dangling"
    }

    fn check(&self, graph: &Graph) -> Vec<Finding> {
        graph
            .dangling()
            .map(|edge| Finding {
                rule: self.name().to_owned(),
                node: edge.from.clone(),
                location: edge.location.clone(),
                message: format!("{} edge to {} names no node", edge.kind.as_str(), edge.to),
                fix: "Name a node that exists.".to_owned(),
            })
            .collect()
    }
}

/// A rule that reports nothing.
struct Quiet;

impl Rule for Quiet {
    fn name(&self) -> &'static str {
        "quiet"
    }

    fn check(&self, _graph: &Graph) -> Vec<Finding> {
        Vec::new()
    }
}

/// Proves every rule's findings come rule by rule, each in its own order.
///
/// Covers: rust-core/rules-run-in-order
#[test]
fn rules_run_in_order() {
    let graph = query_graph();
    let rules: [&dyn Rule; 2] = [&Dangling, &Quiet];
    let findings = run_rules(&graph, &rules);
    let rows: Vec<(String, String, String)> = findings
        .iter()
        .map(|finding| {
            (
                finding.rule.clone(),
                finding.node.to_string(),
                finding.to_string(),
            )
        })
        .collect();
    assert_eq!(
        rows,
        [
            (
                "dangling".to_owned(),
                "item:src/lib.rs::f".to_owned(),
                "src/lib.rs:4: implements edge to requirement:a/two names no node".to_owned()
            ),
            (
                "dangling".to_owned(),
                "capability:a".to_owned(),
                "capability:a: owns edge to file:src/lib.rs names no node".to_owned()
            ),
        ]
    );
    for finding in &findings {
        assert_eq!(finding.fix, "Name a node that exists.");
    }
}

/// Proves a finding displays with its location, or with its node.
///
/// Covers: rust-core/finding-display
#[test]
fn finding_display() {
    let adr = NodeId::Adr("001".to_owned());
    let cases = [
        (Some(at("decisions/001-a.md")), "decisions/001-a.md: m"),
        (Some(at_line("src/lib.rs", 7)), "src/lib.rs:7: m"),
        (None, "adr:001: m"),
    ];
    for (location, display) in cases {
        let finding = Finding {
            rule: "r".to_owned(),
            node: adr.clone(),
            location,
            message: "m".to_owned(),
            fix: "f".to_owned(),
        };
        assert_eq!(finding.to_string(), display);
    }
}
