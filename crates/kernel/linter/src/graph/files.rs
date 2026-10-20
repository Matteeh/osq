//! File, item and test nodes, their tag edges, and ownership edges.

use std::path::{Path, PathBuf};

use osq_core::{Edge, EdgeKind, Graph, Location, Node, NodeId};
use osq_kernel_specs::{Adr, CapabilityOwnership, scope_covers_path};

use super::GraphError;
use super::{adr, specs};
use crate::ScanError;
use crate::tags::{CodeItem, Tag, TagKind, code_tags};
use crate::workspace::{collect_rust_files, parse_members, read_text, relative_slash_path};

/// Adds one `File` node and its item nodes and tag edges per workspace member.
pub(super) fn add(graph: &mut Graph, root: &Path, adrs: &[Adr]) -> Result<(), GraphError> {
    let manifest_path = root.join("Cargo.toml");
    let manifest = read_text(&manifest_path).map_err(GraphError::Scan)?;
    let members = parse_members(&manifest).map_err(|message| {
        GraphError::Scan(ScanError::Manifest {
            path: manifest_path,
            message,
        })
    })?;
    for file in member_files(root, &members) {
        add_file(graph, root, &file, adrs)?;
    }
    Ok(())
}

/// The Rust files of every member, member by member and path by path.
fn member_files(root: &Path, members: &[String]) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for member in members {
        let mut member_files = Vec::new();
        for folder in ["src", "tests"] {
            let mut collected = Vec::new();
            collect_rust_files(&root.join(member).join(folder), &mut collected);
            member_files.extend(
                collected
                    .into_iter()
                    .filter(|path| !in_fixtures(root, path)),
            );
        }
        member_files.sort_by(|left, right| {
            relative_slash_path(root, left).cmp(&relative_slash_path(root, right))
        });
        files.extend(member_files);
    }
    files
}

/// Whether a file lies under a `tests/fixtures` folder.
fn in_fixtures(root: &Path, path: &Path) -> bool {
    let relative = relative_slash_path(root, path);
    let parts: Vec<&str> = relative.split('/').collect();
    parts
        .windows(2)
        .any(|pair| pair.first() == Some(&"tests") && pair.get(1) == Some(&"fixtures"))
}

/// Adds one file's node, its item nodes and every tag edge.
fn add_file(graph: &mut Graph, root: &Path, path: &Path, adrs: &[Adr]) -> Result<(), GraphError> {
    let name = relative_slash_path(root, path);
    let source = read_text(path).map_err(GraphError::Scan)?;
    let tags = code_tags(&name, &source).map_err(GraphError::Scan)?;
    let file_id = NodeId::File(name.clone());
    let _ = graph.add_node(Node {
        id: file_id.clone(),
        name: name.clone(),
        location: Some(Location {
            file: name.clone(),
            line: None,
        }),
        status: None,
        public: false,
        function: false,
    });
    let mut items: Vec<(NodeId, &CodeItem)> = Vec::new();
    for item in &tags.items {
        let key = format!("{name}::{}", item.name);
        let id = if item.test {
            NodeId::Test(key)
        } else {
            NodeId::Item(key)
        };
        let _ = graph.add_node(Node {
            id: id.clone(),
            name: item.name.clone(),
            location: Some(Location {
                file: name.clone(),
                line: Some(item.line),
            }),
            status: None,
            public: item.public,
            function: item.function,
        });
        items.push((id, item));
    }
    for tag in &tags.file_tags {
        add_tag(graph, &file_id, tag, &name, adrs);
    }
    for (id, item) in items {
        for tag in &item.tags {
            add_tag(graph, &id, tag, &name, adrs);
        }
    }
    Ok(())
}

/// Adds the edge one tag states.
fn add_tag(graph: &mut Graph, from: &NodeId, tag: &Tag, file: &str, adrs: &[Adr]) {
    let location = Some(Location {
        file: file.to_owned(),
        line: Some(tag.line),
    });
    let (kind, from, to) = match tag.kind {
        TagKind::Implements => (
            EdgeKind::Implements,
            from.clone(),
            NodeId::Requirement(tag.target.clone()),
        ),
        TagKind::Covers => (
            EdgeKind::Covers,
            from.clone(),
            NodeId::Scenario(tag.target.clone()),
        ),
        TagKind::Adr => (
            EdgeKind::Governs,
            NodeId::Adr(adr::resolve(adrs, &tag.target)),
            from.clone(),
        ),
    };
    graph.add_edge(Edge {
        kind,
        from,
        to,
        location,
    });
}

/// Adds an `owns` edge per capability and file the `ownerships` globs cover.
pub(super) fn add_ownership(
    graph: &mut Graph,
    root: &Path,
    openspec: &Path,
    ownerships: &[CapabilityOwnership],
) {
    let files: Vec<NodeId> = graph
        .nodes()
        .filter(|node| matches!(node.id, NodeId::File(_)))
        .map(|node| node.id.clone())
        .collect();
    for ownership in ownerships {
        let location = Some(Location {
            file: specs::location(root, openspec, &ownership.capability),
            line: None,
        });
        for file in &files {
            let NodeId::File(path) = file else {
                continue;
            };
            if !scope_covers_path(&ownership.globs, path) {
                continue;
            }
            graph.add_edge(Edge {
                kind: EdgeKind::Owns,
                from: NodeId::Capability(ownership.capability.clone()),
                to: file.clone(),
                location: location.clone(),
            });
        }
    }
}
