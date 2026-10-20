//! Source and workspace Node-spawn scan tests.

use osq_kernel_linter::{NodeSpawn, ScanError, node_spawns};
use std::path::PathBuf;

/// One row of the "Spawned programs" table.
struct ProgramRow {
    /// The source form of the program argument.
    program: &'static str,
    /// The program expected in the result, or none.
    expected: Option<&'static str>,
}

/// The rows of the "Spawned programs" table.
const PROGRAM_ROWS: &[ProgramRow] = &[
    ProgramRow {
        program: "\"node\"",
        expected: Some("node"),
    },
    ProgramRow {
        program: "\"npx\"",
        expected: Some("npx"),
    },
    ProgramRow {
        program: "\"openspec\"",
        expected: Some("openspec"),
    },
    ProgramRow {
        program: "\"/usr/bin/node\"",
        expected: Some("/usr/bin/node"),
    },
    ProgramRow {
        program: "\"node.exe\"",
        expected: Some("node.exe"),
    },
    ProgramRow {
        program: "\"C:\\\\tools\\\\npx.cmd\"",
        expected: Some("C:\\tools\\npx.cmd"),
    },
    ProgramRow {
        program: "\"nodemon\"",
        expected: None,
    },
    ProgramRow {
        program: "\"openspec-lsp\"",
        expected: None,
    },
    ProgramRow {
        program: "\"Node\"",
        expected: None,
    },
    ProgramRow {
        program: "\"git\"",
        expected: None,
    },
    ProgramRow {
        program: "program",
        expected: None,
    },
];

/// Builds the scenario source around one program expression.
fn spawn_source(program: &str) -> String {
    format!("fn main() {{\n    let _ = std::process::Command::new({program}).status();\n}}\n")
}

/// Builds the spawn a row expects at line 2.
fn expected_spawn(program: &str) -> NodeSpawn {
    NodeSpawn {
        file: "main.rs".to_owned(),
        line: 2,
        program: program.to_owned(),
    }
}

/// Covers: rust-linter/spawned-programs
#[test]
fn spawned_programs() {
    for row in PROGRAM_ROWS {
        let result = node_spawns("main.rs", &spawn_source(row.program)).expect("the source parses");
        let expected: Vec<NodeSpawn> = row.expected.map(expected_spawn).into_iter().collect();
        assert_eq!(expected, result, "program {}", row.program);
    }
}

/// Covers: rust-linter/spawned-programs
#[test]
fn spawns_keep_source_order_and_lines() {
    let source = concat!(
        "fn main() {\n",
        "    let _ = Command::new(\"node\");\n",
        "    let _ = std::process::Command::new(\"openspec\").arg(\"x\");\n",
        "}\n",
    );
    assert_eq!(
        vec![
            NodeSpawn {
                file: "two.rs".to_owned(),
                line: 2,
                program: "node".to_owned(),
            },
            NodeSpawn {
                file: "two.rs".to_owned(),
                line: 3,
                program: "openspec".to_owned(),
            },
        ],
        node_spawns("two.rs", source).expect("the source parses")
    );
}

/// Covers: rust-linter/spawned-programs
#[test]
fn only_command_new_with_a_string_literal_spawns() {
    let source = concat!(
        "fn main() {\n",
        "    Command::spawn(\"node\");\n",
        "    Other::new(\"node\");\n",
        "    new(\"node\");\n",
        "    Command::new(String::from(\"node\"));\n",
        "    Command::new();\n",
        "    let _ = Command::new(\"git\");\n",
        "}\n",
    );
    let spawns = node_spawns("main.rs", source).expect("the source parses");
    assert!(spawns.is_empty(), "{spawns:?}");
}

/// Covers: rust-linter/unparsable-source
#[test]
fn unparsable_source_is_a_parse_error() {
    let error = node_spawns("broken.rs", "fn main( {\n").expect_err("the source does not parse");
    match error {
        ScanError::Parse { path, line, .. } => {
            assert_eq!(PathBuf::from("broken.rs"), path);
            assert!(line > 0, "the parser reports line {line}");
        }
        other => panic!("expected a parse error, got {other:?}"),
    }
}

/// Covers: rust-linter/spawned-programs
#[test]
fn scan_errors_name_their_path() {
    let read = ScanError::Read {
        path: PathBuf::from("a.rs"),
        message: "denied".to_owned(),
    };
    assert_eq!("a.rs: denied", read.to_string());
    let parse = ScanError::Parse {
        path: PathBuf::from("b.rs"),
        line: 3,
        message: "bad".to_owned(),
    };
    assert_eq!("b.rs:3: bad", parse.to_string());
    let manifest = ScanError::Manifest {
        path: PathBuf::from("Cargo.toml"),
        message: "none".to_owned(),
    };
    assert_eq!("Cargo.toml: none", manifest.to_string());
}

#[path = "node_spawns_workspace.rs"]
mod workspace;
