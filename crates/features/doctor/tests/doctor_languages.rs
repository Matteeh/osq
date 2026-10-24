//! Proves doctor's `languages` line for repositories and root manifests.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_doctor::DoctorFeature;

/// One row of "Doctor languages lines".
struct Row {
    /// The row's name and its scratch folder.
    name: &'static str,
    /// Whether the root is a git repository.
    repository: bool,
    /// Files added to the index, relative to the root.
    tracked: &'static [&'static str],
    /// Files left untracked, relative to the root.
    other: &'static [&'static str],
    /// The row's `languages` line, or none when it prints none.
    expected: Option<&'static str>,
}

/// The rows of "Doctor languages lines", in table order.
const ROWS: &[Row] = &[
    Row {
        name: "rust-root-manifest",
        repository: false,
        tracked: &[],
        other: &["Cargo.toml"],
        expected: Some(
            "[ok] languages: Rust. Rust lacks extras: test output reading, import graph, traceability, function ranges, repository measures",
        ),
    },
    Row {
        name: "four-languages",
        repository: true,
        tracked: &["package.json", "a/Cargo.toml", "b/go.mod", "pyproject.toml"],
        other: &[],
        expected: Some(
            "[warn] languages: TypeScript/JavaScript, Rust, Python, Go. Rust lacks extras: test output reading, import graph, traceability, function ranges, repository measures. Python lacks gates: test-modification gate, denied-dependency gate; extras: verify-command lint, test output reading, import graph, traceability, function ranges, repository measures. Go lacks gates: test-modification gate, denied-dependency gate; extras: verify-command lint, test output reading, import graph, traceability, function ranges, repository measures",
        ),
    },
    Row {
        name: "typescript-only",
        repository: true,
        tracked: &["package.json", "web/package.json"],
        other: &[],
        expected: None,
    },
    Row {
        name: "no-manifest",
        repository: false,
        tracked: &[],
        other: &[],
        expected: None,
    },
    Row {
        name: "untracked-manifest",
        repository: true,
        tracked: &["src/lib.rs"],
        other: &["x/go.mod"],
        expected: None,
    },
    Row {
        name: "go-root-manifest",
        repository: true,
        tracked: &[],
        other: &["go.mod"],
        expected: Some(
            "[warn] languages: Go. Go lacks gates: test-modification gate, denied-dependency gate; extras: verify-command lint, test output reading, import graph, traceability, function ranges, repository measures",
        ),
    },
    Row {
        name: "manifest-folder",
        repository: false,
        tracked: &[],
        other: &["package.json", "Cargo.toml/keep"],
        expected: None,
    },
];

/// A fresh scratch folder named after the row, with its old contents removed.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("doctor_languages")
        .join(name);
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

/// The managed files doctor checks, paired with their test fixture copies.
const MANAGED_FILES: [(&str, &str); 3] = [
    ("AGENTS.md", "agents-block.txt"),
    ("PLANNER.md", "planner-block.txt"),
    (".claude/commands/osq-plan.md", "claude-plan-command.txt"),
];

/// Writes the managed files every doctor root holds.
fn managed_files(root: &Path) {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/managed");
    for (path, fixture) in MANAGED_FILES {
        let text = fs::read_to_string(fixtures.join(fixture)).expect("the managed fixture reads");
        write(&root.join(path), &format!("{text}\n"));
    }
}

/// Runs git in a folder, failing with both streams when it refuses.
fn git(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .expect("git starts");
    assert!(
        output.status.success(),
        "git {args:?}: {}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

/// Runs doctor on a root and returns its output or its failure message.
fn doctor_text(root: &Path) -> String {
    match DoctorFeature.run(&Invocation::new(root, "doctor", Vec::new())) {
        Ok(output) => output.text,
        Err(FeatureError::Failed {
            command, message, ..
        }) => {
            assert_eq!("doctor", command);
            message
        }
        Err(other) => panic!("doctor returned {other:?}"),
    }
}

/// The first line that starts with a status and `languages:`.
fn languages_line(text: &str) -> Option<String> {
    text.lines()
        .find(|line| line.starts_with("[ok] languages: ") || line.starts_with("[warn] languages: "))
        .map(str::to_owned)
}

/// Builds one row's root with its config, managed files and files.
fn build(row: &Row) -> PathBuf {
    let root = scratch(row.name);
    write(&root.join("osq.toml"), "[executor]\nharness = \"mock\"\n");
    managed_files(&root);
    if row.repository {
        git(&root, &["init", "-q"]);
        for path in row.tracked {
            write(&root.join(path), "x");
            git(&root, &["add", "--", path]);
        }
    }
    for path in row.other {
        write(&root.join(path), "x");
    }
    root
}

/// Proves every row of "Doctor languages lines" in its own scratch root.
///
/// Covers: rust-doctor/doctor-languages-lines
#[test]
fn doctor_languages_lines() {
    for row in ROWS {
        let root = build(row);
        assert_eq!(
            row.expected.map(str::to_owned),
            languages_line(&doctor_text(&root)),
            "row {}",
            row.name
        );
    }
}
