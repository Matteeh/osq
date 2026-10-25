//! Proves how show reads an id as a change id.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_show::ShowFeature;

/// Creates an empty scratch root.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the parent folders are created");
    fs::write(path, text).expect("the file is written");
}

/// Runs show with one literal argument on a root.
fn run(root: &Path, argument: &str) -> Result<String, FeatureError> {
    ShowFeature
        .run(&Invocation::new(root, "show", vec![argument.to_owned()]))
        .map(|output| output.text)
}

/// One edge-case row: the argument, the root's folder and its result.
struct Edge<'a> {
    /// The argument show gets.
    argument: &'a str,
    /// The one active change folder the root holds.
    folder: &'a str,
    /// The expected first output line, or `None` when the row fails.
    line: Option<&'a str>,
    /// The expected failure message when the row fails.
    message: Option<&'a str>,
}

/// Every edge form of "Show lookup edge forms".
const EDGES: &[Edge<'_>] = &[
    Edge {
        argument: "0002",
        folder: "0002",
        line: Some("Spec: 0002 (0002)"),
        message: None,
    },
    Edge {
        argument: "02",
        folder: "02-x",
        line: Some("Spec: 02-x (02)"),
        message: None,
    },
    Edge {
        argument: "2",
        folder: "002-x",
        line: Some("Spec: 002-x (002)"),
        message: None,
    },
    Edge {
        argument: "x",
        folder: "002-x",
        line: Some("Spec: 002-x (002)"),
        message: None,
    },
    Edge {
        argument: "x-alpha",
        folder: "x-alpha",
        line: Some("Spec: x-alpha (x-alpha)"),
        message: None,
    },
    Edge {
        argument: "alpha",
        folder: "x-alpha",
        line: None,
        message: Some("Spec \"alpha\" not found in specs or archive"),
    },
    Edge {
        argument: "002-x-y",
        folder: "002-x",
        line: None,
        message: Some("Spec \"002-x-y\" not found in specs or archive"),
    },
    Edge {
        argument: "-2",
        folder: "0-2-x",
        line: None,
        message: Some(
            "\"-2\" is not a change id; give the change's number, such as 7 or 007, its full folder name, or that name without its number",
        ),
    },
    Edge {
        argument: "2]",
        folder: "002-x",
        line: None,
        message: Some(
            "\"2]\" is not a change id; give the change's number, such as 7 or 007, its full folder name, or that name without its number",
        ),
    },
];

/// Proves every edge form of "Show lookup edge forms".
///
/// Covers: rust-show/show-lookup-edge-forms
#[test]
fn show_lookup_edge_forms() {
    for (index, edge) in EDGES.iter().enumerate() {
        let root = scratch(&format!("show-change-ids-edge-{index}"));
        write(
            &root
                .join("openspec/changes")
                .join(edge.folder)
                .join("proposal.md"),
            "---\ntitle: Edge\n---\n## Goal\n\nGoal.\n",
        );
        let result = run(&root, edge.argument);
        match (edge.line, edge.message) {
            (Some(line), None) => {
                let output = result.expect("the edge form is found");
                assert_eq!(output.lines().next(), Some(line), "{}", edge.argument);
            }
            (None, Some(message)) => {
                let error = result.expect_err("the edge form is refused");
                match error {
                    FeatureError::Failed {
                        command,
                        message: actual,
                        ..
                    } => {
                        assert_eq!(command, "show", "{}", edge.argument);
                        assert_eq!(actual, message, "{}", edge.argument);
                    }
                    other => panic!("{}: expected a failed error, got {other:?}", edge.argument),
                }
            }
            _ => panic!("{}: the row has one result", edge.argument),
        }
    }
}
