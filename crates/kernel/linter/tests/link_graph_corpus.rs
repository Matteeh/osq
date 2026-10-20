//! Corpus test: every tag line of this repository's Rust files becomes an
//! edge of its link graph.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{EdgeKind, Graph, NodeId};
use osq_kernel_linter::build_link_graph;
use osq_kernel_specs::{read_decisions, read_living_spec};

/// The repository root, three folders above this crate.
fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("the repository root is three folders above crates/kernel/linter")
        .to_path_buf()
}

/// The tag lines one file holds.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct Counts {
    /// Lines starting with an `Implements:` doc marker.
    implements: usize,
    /// Lines starting with a `Covers:` doc marker.
    covers: usize,
    /// Lines starting with an `Adr:` doc marker.
    governs: usize,
}

/// Counts the tag lines of one file by plain text matching.
fn tag_lines(path: &Path) -> Counts {
    let text = fs::read_to_string(path).expect("a graph file reads");
    let mut counts = Counts::default();
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with("/// Implements:") || line.starts_with("//! Implements:") {
            counts.implements += 1;
        } else if line.starts_with("/// Covers:") {
            counts.covers += 1;
        } else if line.starts_with("/// Adr:") || line.starts_with("//! Adr:") {
            counts.governs += 1;
        }
    }
    counts
}

/// The capability folders under `specs`, in byte order.
fn capability_folders(specs: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(specs) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter(|entry| entry.path().join("spec.md").is_file())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

/// The ids of the graph's nodes of one kind.
fn ids(graph: &Graph, kind: fn(NodeId) -> bool) -> BTreeSet<NodeId> {
    graph
        .nodes()
        .filter(|node| kind(node.id.clone()))
        .map(|node| node.id.clone())
        .collect()
}

/// Counts the edges each of the graph's files holds.
fn edge_counts(graph: &Graph) -> BTreeMap<String, Counts> {
    let mut counts: BTreeMap<String, Counts> = BTreeMap::new();
    for node in graph.nodes() {
        if let NodeId::File(key) = &node.id {
            counts.insert(key.clone(), Counts::default());
        }
    }
    for edge in graph.edges() {
        let Some(location) = &edge.location else {
            continue;
        };
        if location.line.is_none() {
            continue;
        }
        let Some(file) = counts.get_mut(&location.file) else {
            continue;
        };
        match edge.kind {
            EdgeKind::Implements => file.implements += 1,
            EdgeKind::Covers => file.covers += 1,
            EdgeKind::Governs
                if matches!(edge.to, NodeId::Item(_) | NodeId::Test(_) | NodeId::File(_)) =>
            {
                file.governs += 1;
            }
            _ => {}
        }
    }
    counts
}

/// Covers: rust-linter/live-tags-become-edges
#[test]
#[ignore = "corpus test: builds the link graph of this repository"]
fn live_tags_become_edges() {
    let root = repository_root();
    let decisions = Path::new("decisions");
    let openspec = Path::new("openspec");
    let graph = build_link_graph(&root, decisions, openspec).expect("the repository builds");

    let records = read_decisions(&root, decisions, openspec);
    let adrs: BTreeSet<NodeId> = records
        .adrs
        .iter()
        .map(|adr| NodeId::Adr(adr.number.clone()))
        .collect();
    assert_eq!(adrs, ids(&graph, |id| matches!(id, NodeId::Adr(_))));

    let specs = root.join(openspec).join("specs");
    let capabilities: BTreeSet<NodeId> = capability_folders(&specs)
        .into_iter()
        .map(NodeId::Capability)
        .collect();
    assert_eq!(
        capabilities,
        ids(&graph, |id| matches!(id, NodeId::Capability(_)))
    );
    for capability in capability_folders(&specs) {
        let spec = specs.join(&capability).join("spec.md");
        read_living_spec(&spec).expect("a living spec reads");
    }

    let expected: BTreeMap<String, Counts> = graph
        .nodes()
        .filter_map(|node| match &node.id {
            NodeId::File(key) => Some((key.clone(), tag_lines(&root.join(key)))),
            _ => None,
        })
        .collect();
    let actual = edge_counts(&graph);
    let mut differences = Vec::new();
    for (file, wanted) in &expected {
        let got = actual.get(file).copied().unwrap_or_default();
        if &got != wanted {
            differences.push(format!("{file}: expected {wanted:?}, got {got:?}"));
        }
    }
    for (file, got) in &actual {
        if !expected.contains_key(file) && *got != Counts::default() {
            differences.push(format!("{file}: expected no counts, got {got:?}"));
        }
    }
    assert!(
        differences.is_empty(),
        "tag counts differ:\n{}",
        differences.join("\n")
    );
    assert!(graph.edges_of(EdgeKind::Implements).next().is_some());
    assert!(graph.edges_of(EdgeKind::Covers).next().is_some());
}
