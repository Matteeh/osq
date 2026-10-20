//! Link graph fixture tests.

use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Edge, EdgeKind, Graph, Location, Node, NodeId};
use osq_kernel_linter::{GraphError, ScanError, build_link_graph};
use osq_kernel_specs::SpecsError;

/// The first ADR's path.
const FIRST: &str = "decisions/001-first.md";
/// The second ADR's path.
const SECOND: &str = "decisions/002-everything.md";
/// The third ADR's path.
const THIRD: &str = "decisions/003-third.md";
/// The alpha living spec's path.
const ALPHA: &str = "openspec/specs/alpha/spec.md";
/// The beta living spec's path.
const BETA: &str = "openspec/specs/beta/spec.md";
/// The alpha library's path.
const ALPHA_LIB: &str = "crates/alpha/src/lib.rs";
/// The alpha shared file's path.
const SHARED: &str = "crates/alpha/src/shared.rs";
/// The alpha test file's path.
const ADDING: &str = "crates/alpha/tests/adding.rs";
/// The beta library's path.
const BETA_LIB: &str = "crates/beta/src/lib.rs";

/// The copied link graph fixture project.
fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/link-graph")
}

/// Builds the fixture's link graph.
fn fixture_graph() -> Graph {
    build_link_graph(
        &fixture_root(),
        Path::new("decisions"),
        Path::new("openspec"),
    )
    .expect("the fixture builds")
}

/// One row of the expected node table.
struct NodeRow {
    /// The node id's constructor.
    kind: fn(String) -> NodeId,
    /// The node id's key.
    key: &'static str,
    /// The node's name.
    name: &'static str,
    /// The node's file, when it has one.
    file: Option<&'static str>,
    /// The node's line, when it has one.
    line: Option<usize>,
    /// The node's status, when it has one.
    status: Option<&'static str>,
    /// Whether the node is public.
    public: bool,
    /// Whether the node's item is a function.
    function: bool,
}

/// The expected nodes of the fixture, in id order.
const NODE_ROWS: &[NodeRow] = &[
    NodeRow {
        kind: NodeId::Adr,
        key: "001",
        name: "First decision",
        file: Some(FIRST),
        line: None,
        status: Some("superseded"),
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::Adr,
        key: "002",
        name: "Everything",
        file: Some(SECOND),
        line: None,
        status: Some("accepted"),
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::Adr,
        key: "003",
        name: "Third decision",
        file: Some(THIRD),
        line: None,
        status: Some("accepted"),
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::Capability,
        key: "alpha",
        name: "alpha",
        file: Some(ALPHA),
        line: None,
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::Capability,
        key: "beta",
        name: "beta",
        file: Some(BETA),
        line: None,
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::Group,
        key: "tools",
        name: "tools",
        file: None,
        line: None,
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::Requirement,
        key: "alpha/adds-numbers",
        name: "Adds Numbers",
        file: Some(ALPHA),
        line: None,
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::Requirement,
        key: "alpha/code-ownership",
        name: "Code ownership",
        file: Some(ALPHA),
        line: None,
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::Requirement,
        key: "beta/code-ownership",
        name: "Code ownership",
        file: Some(BETA),
        line: None,
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::Requirement,
        key: "beta/formats-text",
        name: "Formats text",
        file: Some(BETA),
        line: None,
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::Scenario,
        key: "alpha/alpha-ownership",
        name: "Alpha ownership",
        file: Some(ALPHA),
        line: None,
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::Scenario,
        key: "alpha/big-sums",
        name: "Big sums",
        file: Some(ALPHA),
        line: None,
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::Scenario,
        key: "alpha/two-plus-two",
        name: "Two plus two",
        file: Some(ALPHA),
        line: None,
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::Scenario,
        key: "beta/beta-ownership",
        name: "Beta ownership",
        file: Some(BETA),
        line: None,
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::Scenario,
        key: "beta/plain-text",
        name: "Plain text",
        file: Some(BETA),
        line: None,
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::File,
        key: ALPHA_LIB,
        name: ALPHA_LIB,
        file: Some(ALPHA_LIB),
        line: None,
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::File,
        key: SHARED,
        name: SHARED,
        file: Some(SHARED),
        line: None,
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::File,
        key: ADDING,
        name: ADDING,
        file: Some(ADDING),
        line: None,
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::File,
        key: BETA_LIB,
        name: BETA_LIB,
        file: Some(BETA_LIB),
        line: None,
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::Item,
        key: "crates/alpha/src/lib.rs::Total",
        name: "Total",
        file: Some(ALPHA_LIB),
        line: Some(16),
        status: None,
        public: true,
        function: false,
    },
    NodeRow {
        kind: NodeId::Item,
        key: "crates/alpha/src/lib.rs::Total::value",
        name: "Total::value",
        file: Some(ALPHA_LIB),
        line: Some(22),
        status: None,
        public: true,
        function: true,
    },
    NodeRow {
        kind: NodeId::Item,
        key: "crates/alpha/src/lib.rs::add",
        name: "add",
        file: Some(ALPHA_LIB),
        line: Some(11),
        status: None,
        public: true,
        function: true,
    },
    NodeRow {
        kind: NodeId::Item,
        key: "crates/alpha/src/lib.rs::double",
        name: "double",
        file: Some(ALPHA_LIB),
        line: Some(30),
        status: None,
        public: false,
        function: true,
    },
    NodeRow {
        kind: NodeId::Item,
        key: "crates/alpha/src/lib.rs::shared",
        name: "shared",
        file: Some(ALPHA_LIB),
        line: Some(5),
        status: None,
        public: false,
        function: false,
    },
    NodeRow {
        kind: NodeId::Item,
        key: "crates/alpha/src/shared.rs::trim",
        name: "trim",
        file: Some(SHARED),
        line: Some(6),
        status: None,
        public: true,
        function: true,
    },
    NodeRow {
        kind: NodeId::Item,
        key: "crates/alpha/tests/adding.rs::helper",
        name: "helper",
        file: Some(ADDING),
        line: Some(20),
        status: None,
        public: false,
        function: true,
    },
    NodeRow {
        kind: NodeId::Item,
        key: "crates/beta/src/lib.rs::format",
        name: "format",
        file: Some(BETA_LIB),
        line: Some(7),
        status: None,
        public: true,
        function: true,
    },
    NodeRow {
        kind: NodeId::Test,
        key: "crates/alpha/tests/adding.rs::any_sum",
        name: "any_sum",
        file: Some(ADDING),
        line: Some(27),
        status: None,
        public: false,
        function: true,
    },
    NodeRow {
        kind: NodeId::Test,
        key: "crates/alpha/tests/adding.rs::big_sums_by_title",
        name: "big_sums_by_title",
        file: Some(ADDING),
        line: Some(15),
        status: None,
        public: false,
        function: true,
    },
    NodeRow {
        kind: NodeId::Test,
        key: "crates/alpha/tests/adding.rs::two_plus_two",
        name: "two_plus_two",
        file: Some(ADDING),
        line: Some(7),
        status: None,
        public: false,
        function: true,
    },
];

/// One row of the expected edge table.
struct EdgeRow {
    /// The edge's kind.
    kind: EdgeKind,
    /// The id constructor and key the edge starts at.
    from: (fn(String) -> NodeId, &'static str),
    /// The id constructor and key the edge ends at.
    to: (fn(String) -> NodeId, &'static str),
    /// The path the edge is stated at.
    file: &'static str,
    /// The line the edge is stated at, when it has one.
    line: Option<usize>,
}

/// The expected edges of the fixture, in added order.
const EDGE_ROWS: &[EdgeRow] = &[
    EdgeRow {
        kind: EdgeKind::AppliesTo,
        from: (NodeId::Adr, "001"),
        to: (NodeId::Capability, "alpha"),
        file: FIRST,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::AppliesTo,
        from: (NodeId::Adr, "001"),
        to: (NodeId::Group, "tools"),
        file: FIRST,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::AppliesTo,
        from: (NodeId::Adr, "001"),
        to: (NodeId::Capability, "ghost"),
        file: FIRST,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::Governs,
        from: (NodeId::Adr, "001"),
        to: (NodeId::Capability, "alpha"),
        file: FIRST,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::Governs,
        from: (NodeId::Adr, "001"),
        to: (NodeId::Capability, "ghost"),
        file: FIRST,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::Supersedes,
        from: (NodeId::Adr, "003"),
        to: (NodeId::Adr, "001"),
        file: FIRST,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::Governs,
        from: (NodeId::Adr, "002"),
        to: (NodeId::Capability, "alpha"),
        file: SECOND,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::Governs,
        from: (NodeId::Adr, "002"),
        to: (NodeId::Capability, "beta"),
        file: SECOND,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::AppliesTo,
        from: (NodeId::Adr, "003"),
        to: (NodeId::Group, "tools"),
        file: THIRD,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::AppliesTo,
        from: (NodeId::Adr, "003"),
        to: (NodeId::Capability, "beta"),
        file: THIRD,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::AppliesTo,
        from: (NodeId::Adr, "003"),
        to: (NodeId::Group, "nobody"),
        file: THIRD,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::Governs,
        from: (NodeId::Adr, "003"),
        to: (NodeId::Capability, "alpha"),
        file: THIRD,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::Governs,
        from: (NodeId::Adr, "003"),
        to: (NodeId::Capability, "beta"),
        file: THIRD,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::Supersedes,
        from: (NodeId::Adr, "7"),
        to: (NodeId::Adr, "003"),
        file: THIRD,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::Implements,
        from: (NodeId::File, ALPHA_LIB),
        to: (NodeId::Requirement, "alpha/code-ownership"),
        file: ALPHA_LIB,
        line: Some(3),
    },
    EdgeRow {
        kind: EdgeKind::Implements,
        from: (NodeId::Item, "crates/alpha/src/lib.rs::add"),
        to: (NodeId::Requirement, "alpha/adds-numbers"),
        file: ALPHA_LIB,
        line: Some(9),
    },
    EdgeRow {
        kind: EdgeKind::Governs,
        from: (NodeId::Adr, "002"),
        to: (NodeId::Item, "crates/alpha/src/lib.rs::add"),
        file: ALPHA_LIB,
        line: Some(10),
    },
    EdgeRow {
        kind: EdgeKind::Implements,
        from: (NodeId::Item, "crates/alpha/src/lib.rs::Total::value"),
        to: (NodeId::Requirement, "alpha/missing-requirement"),
        file: ALPHA_LIB,
        line: Some(21),
    },
    EdgeRow {
        kind: EdgeKind::Governs,
        from: (NodeId::Adr, "9"),
        to: (NodeId::Item, "crates/alpha/src/lib.rs::double"),
        file: ALPHA_LIB,
        line: Some(29),
    },
    EdgeRow {
        kind: EdgeKind::Implements,
        from: (NodeId::Item, "crates/alpha/src/shared.rs::trim"),
        to: (NodeId::Requirement, "beta/formats-text"),
        file: SHARED,
        line: Some(5),
    },
    EdgeRow {
        kind: EdgeKind::Covers,
        from: (NodeId::Test, "crates/alpha/tests/adding.rs::two_plus_two"),
        to: (NodeId::Scenario, "alpha/two-plus-two"),
        file: ADDING,
        line: Some(5),
    },
    EdgeRow {
        kind: EdgeKind::Covers,
        from: (
            NodeId::Test,
            "crates/alpha/tests/adding.rs::big_sums_by_title",
        ),
        to: (NodeId::Scenario, "alpha/Big sums"),
        file: ADDING,
        line: Some(13),
    },
    EdgeRow {
        kind: EdgeKind::Covers,
        from: (NodeId::Item, "crates/alpha/tests/adding.rs::helper"),
        to: (NodeId::Scenario, "alpha/two-plus-two"),
        file: ADDING,
        line: Some(19),
    },
    EdgeRow {
        kind: EdgeKind::Covers,
        from: (NodeId::Test, "crates/alpha/tests/adding.rs::any_sum"),
        to: (NodeId::Scenario, "alpha/big-sums"),
        file: ADDING,
        line: Some(25),
    },
    EdgeRow {
        kind: EdgeKind::Implements,
        from: (NodeId::Item, "crates/beta/src/lib.rs::format"),
        to: (NodeId::Requirement, "beta/formats-text"),
        file: BETA_LIB,
        line: Some(5),
    },
    EdgeRow {
        kind: EdgeKind::Implements,
        from: (NodeId::Item, "crates/beta/src/lib.rs::format"),
        to: (NodeId::Requirement, "alpha/adds-numbers"),
        file: BETA_LIB,
        line: Some(6),
    },
    EdgeRow {
        kind: EdgeKind::Owns,
        from: (NodeId::Capability, "alpha"),
        to: (NodeId::File, ALPHA_LIB),
        file: ALPHA,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::Owns,
        from: (NodeId::Capability, "alpha"),
        to: (NodeId::File, SHARED),
        file: ALPHA,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::Owns,
        from: (NodeId::Capability, "alpha"),
        to: (NodeId::File, ADDING),
        file: ALPHA,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::Owns,
        from: (NodeId::Capability, "beta"),
        to: (NodeId::File, SHARED),
        file: BETA,
        line: None,
    },
    EdgeRow {
        kind: EdgeKind::Owns,
        from: (NodeId::Capability, "beta"),
        to: (NodeId::File, BETA_LIB),
        file: BETA,
        line: None,
    },
];

/// Builds the expected nodes from the rows.
fn expected_nodes() -> Vec<Node> {
    NODE_ROWS
        .iter()
        .map(|row| Node {
            id: (row.kind)(row.key.to_owned()),
            name: row.name.to_owned(),
            location: row.file.map(|file| Location {
                file: file.to_owned(),
                line: row.line,
            }),
            status: row.status.map(str::to_owned),
            public: row.public,
            function: row.function,
        })
        .collect()
}

/// Builds the expected edges from the rows.
fn expected_edges() -> Vec<Edge> {
    EDGE_ROWS
        .iter()
        .map(|row| Edge {
            kind: row.kind,
            from: (row.from.0)(row.from.1.to_owned()),
            to: (row.to.0)(row.to.1.to_owned()),
            location: Some(Location {
                file: row.file.to_owned(),
                line: row.line,
            }),
        })
        .collect()
}

/// Asserts two rows match, naming the first row that differs.
fn assert_rows<T: std::fmt::Debug + PartialEq>(actual: &[T], expected: &[T], label: &str) {
    for (index, (got, wanted)) in actual.iter().zip(expected).enumerate() {
        assert_eq!(
            wanted, got,
            "{label} row {index} differs: expected {wanted:?}, got {got:?}"
        );
    }
    assert_eq!(
        expected.len(),
        actual.len(),
        "{label} has {} rows, expected {}",
        actual.len(),
        expected.len()
    );
}

/// Covers: rust-linter/nodes-of-the-link-graph-fixture
#[test]
fn nodes_of_the_link_graph_fixture() {
    let graph = fixture_graph();
    let actual: Vec<Node> = graph.nodes().cloned().collect();
    assert_rows(&actual, &expected_nodes(), "node");
}

/// Covers: rust-linter/edges-of-the-link-graph-fixture
#[test]
fn edges_of_the_link_graph_fixture() {
    let graph = fixture_graph();
    let actual: Vec<Edge> = graph.edges().cloned().collect();
    assert_rows(&actual, &expected_edges(), "edge");
}

/// Covers: rust-linter/dangling-edges-of-the-link-graph-fixture
#[test]
fn dangling_edges_of_the_link_graph_fixture() {
    let graph = fixture_graph();
    let actual: Vec<Edge> = graph.dangling().cloned().collect();
    let expected: Vec<Edge> = expected_edges()
        .into_iter()
        .enumerate()
        .filter(|(index, _)| matches!(index, 2 | 4 | 10 | 13 | 17 | 18 | 21))
        .map(|(_, edge)| edge)
        .collect();
    assert_rows(&actual, &expected, "dangling");
}

/// Covers: rust-linter/link-graph-rebuilds-the-same
#[test]
fn link_graph_rebuilds_the_same() {
    assert_eq!(fixture_graph(), fixture_graph());
}

/// Creates a fresh scratch project folder.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch folder is created");
    root
}

/// Writes one file of a scratch project, creating its folders.
fn write(root: &Path, path: &str, text: &str) {
    let full = root.join(path);
    fs::create_dir_all(full.parent().expect("the file has a parent"))
        .expect("the parent folder is created");
    fs::write(full, text).expect("the file is written");
}

/// Writes a root manifest naming one member.
fn workspace(root: &Path) {
    write(
        root,
        "Cargo.toml",
        "[workspace]\nmembers = [\"crates/one\"]\n",
    );
}

/// Builds a scratch project.
fn build(root: &Path) -> Result<Graph, GraphError> {
    build_link_graph(root, Path::new("decisions"), Path::new("openspec"))
}

/// Unwraps a scan error and checks that the graph error shows it.
fn scan_error(result: Result<Graph, GraphError>) -> ScanError {
    match result {
        Err(GraphError::Scan(inner)) => {
            assert_eq!(
                inner.to_string(),
                GraphError::Scan(inner.clone()).to_string()
            );
            inner
        }
        other => panic!("expected a scan error, got {other:?}"),
    }
}

/// Unwraps a specs error and checks that the graph error shows it.
fn specs_error(result: Result<Graph, GraphError>) -> SpecsError {
    match result {
        Err(GraphError::Specs(inner)) => {
            assert_eq!(
                inner.to_string(),
                GraphError::Specs(inner.clone()).to_string()
            );
            inner
        }
        other => panic!("expected a specs error, got {other:?}"),
    }
}

/// Covers: rust-linter/link-graph-errors
#[test]
fn link_graph_errors() {
    let root = scratch("link-graph-no-workspace");
    write(&root, "Cargo.toml", "[package]\nname = \"one\"\n");
    match scan_error(build(&root)) {
        ScanError::Manifest { path, .. } => assert_eq!(root.join("Cargo.toml"), path),
        other => panic!("expected a manifest error, got {other:?}"),
    }

    let root = scratch("link-graph-unparsable-source");
    workspace(&root);
    write(&root, "crates/one/src/lib.rs", "fn main( {\n");
    match scan_error(build(&root)) {
        ScanError::Parse { path, .. } => {
            assert_eq!(PathBuf::from("crates/one/src/lib.rs"), path);
        }
        other => panic!("expected a parse error, got {other:?}"),
    }

    let root = scratch("link-graph-unreadable-spec");
    workspace(&root);
    write(&root, "crates/one/src/lib.rs", "pub fn one() {}\n");
    let spec = root.join("openspec/specs/alpha/spec.md");
    fs::create_dir_all(spec.parent().expect("the spec has a parent"))
        .expect("the spec folder is created");
    fs::write(&spec, [0xff, 0xfe]).expect("the spec is written");
    match specs_error(build(&root)) {
        SpecsError::Read { path, .. } => assert_eq!(spec, path),
        other => panic!("expected a specs read error, got {other:?}"),
    }

    let root = scratch("link-graph-no-folders");
    workspace(&root);
    write(&root, "crates/one/src/lib.rs", "pub fn one() {}\n");
    let graph = build(&root).expect("the project builds");
    for node in graph.nodes() {
        assert!(
            !matches!(
                node.id,
                NodeId::Adr(_) | NodeId::Capability(_) | NodeId::Group(_)
            ),
            "unexpected node {:?}",
            node.id
        );
    }

    let scan = GraphError::Scan(ScanError::Manifest {
        path: PathBuf::from("Cargo.toml"),
        message: "no workspace".to_owned(),
    });
    assert!(scan.source().is_some());
    let specs = GraphError::Specs(SpecsError::Read {
        path: PathBuf::from("spec.md"),
        message: "not UTF-8".to_owned(),
    });
    assert!(specs.source().is_some());
}

/// A number that is not all digits, or is empty, stays as written.
///
/// Covers: rust-linter/link-graph-errors
#[test]
fn adr_numbers_need_digits() {
    let root = scratch("link-graph-adr-empty-target");
    workspace(&root);
    write(
        &root,
        "crates/one/src/lib.rs",
        "/// Adr: \nfn empty() {}\n\n/// Adr: abc\nfn named() {}\n",
    );
    write(
        &root,
        "decisions/000-zero.md",
        "---\nstatus: accepted\napplies_to: [alpha]\nrule: Zero.\n---\n# 000. Zero\n",
    );
    let graph = build(&root).expect("the project builds");
    let from: Vec<String> = graph
        .edges_of(EdgeKind::Governs)
        .filter(|edge| matches!(edge.to, NodeId::Item(_)))
        .map(|edge| edge.from.to_string())
        .collect();
    assert_eq!(vec!["adr:", "adr:abc"], from);
}
