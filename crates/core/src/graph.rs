//! ADR 024's link graph: plain data, with no IO.
//!
//! A graph holds [nodes](Node) keyed by [ids](NodeId) and [edges](Edge) in the
//! order they were added. Edges may name ids no node has; [`Graph::dangling`]
//! lists them so a rule can report a tag that names something missing.
//! [`tag_id`] turns a requirement or scenario name into the id its tag names.
//!
//! Implements: rust-core/link-graph
//! Implements: rust-core/tag-ids
//! Implements: rust-core/link-rules

use std::collections::BTreeMap;
use std::collections::btree_map::Entry;
use std::fmt;

/// The id of one node: its kind and its key.
///
/// Ids order by kind, in the order of the variants below, and then by the
/// key's bytes.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum NodeId {
    /// One decision record, keyed by its number as written.
    Adr(String),
    /// One capability, keyed by its folder name.
    Capability(String),
    /// One capability group, keyed by its name.
    Group(String),
    /// One requirement, keyed by `<capability>/<tag id>`.
    Requirement(String),
    /// One scenario, keyed by `<capability>/<tag id>`.
    Scenario(String),
    /// One file, keyed by its path relative to the project root.
    File(String),
    /// One code item, keyed by `<file>::<item name>`.
    Item(String),
    /// One test, keyed by `<file>::<item name>`.
    Test(String),
    /// One change, keyed by its number.
    Change(String),
}

impl fmt::Display for NodeId {
    /// Writes the id as its kind's prefix, a colon and its key.
    ///
    /// Implements: rust-core/link-graph
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let (prefix, key) = match self {
            Self::Adr(key) => ("adr", key),
            Self::Capability(key) => ("capability", key),
            Self::Group(key) => ("group", key),
            Self::Requirement(key) => ("requirement", key),
            Self::Scenario(key) => ("scenario", key),
            Self::File(key) => ("file", key),
            Self::Item(key) => ("item", key),
            Self::Test(key) => ("test", key),
            Self::Change(key) => ("change", key),
        };
        write!(formatter, "{prefix}:{key}")
    }
}

/// Where in the files a node or edge is stated.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Location {
    /// The path relative to the project root, written with `/`.
    pub file: String,
    /// The 1-based line, when the place is one line.
    pub line: Option<usize>,
}

impl fmt::Display for Location {
    /// Writes `<file>:<line>`, or `<file>` without a line.
    ///
    /// Implements: rust-core/link-graph
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.line {
            Some(line) => write!(formatter, "{}:{line}", self.file),
            None => formatter.write_str(&self.file),
        }
    }
}

/// One node of the link graph.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Node {
    /// The node's id.
    pub id: NodeId,
    /// The node's name, as the source writes it.
    pub name: String,
    /// Where the node is stated, when a place names it.
    pub location: Option<Location>,
    /// An ADR's status, when the node is an ADR.
    pub status: Option<String>,
    /// Whether an item is public.
    pub public: bool,
}

/// The kind of an edge.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EdgeKind {
    /// An ADR applies to a capability or group.
    AppliesTo,
    /// An ADR governs a capability or code node.
    Governs,
    /// A capability owns a file.
    Owns,
    /// A node implements a requirement.
    Implements,
    /// A node covers a scenario.
    Covers,
    /// A node reads something.
    Reads,
    /// A node writes something.
    Writes,
    /// An ADR supersedes another.
    Supersedes,
    /// A node departs from an ADR.
    Departs,
}

impl EdgeKind {
    /// The kind's name, as a finding writes it.
    ///
    /// Implements: rust-core/link-graph
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::AppliesTo => "applies_to",
            Self::Governs => "governs",
            Self::Owns => "owns",
            Self::Implements => "implements",
            Self::Covers => "covers",
            Self::Reads => "reads",
            Self::Writes => "writes",
            Self::Supersedes => "supersedes",
            Self::Departs => "departs",
        }
    }
}

/// One edge of the link graph.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Edge {
    /// The edge's kind.
    pub kind: EdgeKind,
    /// The id the edge starts at.
    pub from: NodeId,
    /// The id the edge ends at.
    pub to: NodeId,
    /// Where the files state the edge.
    pub location: Option<Location>,
}

/// A link graph: nodes by id and every edge in added order.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Graph {
    /// The nodes, in id order.
    nodes: BTreeMap<NodeId, Node>,
    /// Every edge, in the order it was added.
    edges: Vec<Edge>,
}

impl Graph {
    /// Adds a node, keeping the first node with that id.
    ///
    /// Returns true when the node was added and false when a node with its id
    /// was already there.
    ///
    /// Implements: rust-core/link-graph
    #[must_use]
    pub fn add_node(&mut self, node: Node) -> bool {
        match self.nodes.entry(node.id.clone()) {
            Entry::Occupied(_) => false,
            Entry::Vacant(slot) => {
                slot.insert(node);
                true
            }
        }
    }

    /// Adds an edge, keeping every edge in added order.
    ///
    /// Implements: rust-core/link-graph
    pub fn add_edge(&mut self, edge: Edge) {
        self.edges.push(edge);
    }

    /// Finds a node by id.
    ///
    /// Implements: rust-core/link-graph
    #[must_use]
    pub fn node(&self, id: &NodeId) -> Option<&Node> {
        self.nodes.get(id)
    }

    /// The nodes, in id order.
    ///
    /// Implements: rust-core/link-graph
    pub fn nodes(&self) -> impl Iterator<Item = &Node> {
        self.nodes.values()
    }

    /// Every edge, in added order.
    ///
    /// Implements: rust-core/link-graph
    pub fn edges(&self) -> impl Iterator<Item = &Edge> {
        self.edges.iter()
    }

    /// The edges of one kind, in added order.
    ///
    /// Implements: rust-core/link-graph
    pub fn edges_of(&self, kind: EdgeKind) -> impl Iterator<Item = &Edge> {
        self.edges.iter().filter(move |edge| edge.kind == kind)
    }

    /// The edges from one id, in added order.
    ///
    /// Implements: rust-core/link-graph
    pub fn edges_from(&self, id: &NodeId) -> impl Iterator<Item = &Edge> {
        self.edges.iter().filter(move |edge| edge.from == *id)
    }

    /// The edges to one id, in added order.
    ///
    /// Implements: rust-core/link-graph
    pub fn edges_to(&self, id: &NodeId) -> impl Iterator<Item = &Edge> {
        self.edges.iter().filter(move |edge| edge.to == *id)
    }

    /// The edges with an end that names no node, in added order.
    ///
    /// Implements: rust-core/link-graph
    pub fn dangling(&self) -> impl Iterator<Item = &Edge> {
        self.edges.iter().filter(|edge| {
            !self.nodes.contains_key(&edge.from) || !self.nodes.contains_key(&edge.to)
        })
    }
}

/// A link rule: a named check over a graph.
pub trait Rule {
    /// The rule's name.
    ///
    /// Implements: rust-core/link-rules
    fn name(&self) -> &str;

    /// The rule's findings for a graph, in the order it returns them.
    ///
    /// Implements: rust-core/link-rules
    fn check(&self, graph: &Graph) -> Vec<Finding>;
}

/// One rule's finding about a node.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Finding {
    /// The name of the rule that found it.
    pub rule: String,
    /// The node the finding is about.
    pub node: NodeId,
    /// Where the finding is stated, when a place states it.
    pub location: Option<Location>,
    /// What is wrong.
    pub message: String,
    /// What to do about it.
    pub fix: String,
}

impl fmt::Display for Finding {
    /// Writes `<location>: <message>`, or `<node>: <message>` without a
    /// location.
    ///
    /// Implements: rust-core/link-rules
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.location {
            Some(location) => write!(formatter, "{location}: {}", self.message),
            None => write!(formatter, "{}: {}", self.node, self.message),
        }
    }
}

/// Runs every rule in the order given, collecting their findings in order.
///
/// Implements: rust-core/link-rules
#[must_use]
pub fn run_rules(graph: &Graph, rules: &[&dyn Rule]) -> Vec<Finding> {
    rules.iter().flat_map(|rule| rule.check(graph)).collect()
}

/// Turns a requirement or scenario name into the kebab-case id its tag names.
///
/// ASCII letters are lowercased, ASCII digits are kept, every run of any other
/// characters becomes one `-`, and a leading or trailing `-` is dropped.
///
/// Implements: rust-core/tag-ids
#[must_use]
pub fn tag_id(name: &str) -> String {
    let mut id = String::new();
    for character in name.chars() {
        if character.is_ascii_alphanumeric() {
            id.push(character.to_ascii_lowercase());
        } else if !id.is_empty() && !id.ends_with('-') {
            id.push('-');
        }
    }
    if id.ends_with('-') {
        id.pop();
    }
    id
}
