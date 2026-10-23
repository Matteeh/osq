//! Proves that `spec` prints TypeScript's output and its own argument errors.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_show::ShowFeature;
use serde::Deserialize;

/// One golden row from `spec.json`.
#[derive(Deserialize)]
struct Row {
    /// The row's name, also its scratch folder's name.
    name: String,
    /// Whether the row runs on the fixture project or an empty folder.
    root: String,
    /// The arguments the row gives `spec`.
    args: Vec<String>,
    /// The exit code TypeScript's CLI gave.
    code: i32,
    /// The stdout TypeScript's CLI gave.
    stdout: String,
    /// The stderr TypeScript's CLI gave.
    stderr: String,
}

/// The fixture project every `project` row copies.
fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/spec-project")
}

/// The folder that holds the goldens.
fn golden() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/spec-golden")
}

/// Creates a new scratch root for one row.
fn scratch(name: &str, kind: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    if kind == "project" {
        copy_dir(&fixture(), &root);
    } else {
        fs::create_dir_all(&root).expect("the scratch root is created");
    }
    root
}

/// Copies a directory tree recursively.
fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("the destination folder is created");
    for entry in fs::read_dir(from)
        .expect("the source folder reads")
        .flatten()
    {
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type reads").is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("the file is copied");
        }
    }
}

/// Runs `spec` on a root with the given arguments.
fn run(root: &Path, args: &[String]) -> Result<String, FeatureError> {
    ShowFeature
        .run(&Invocation::new(root, "spec", args.to_vec()))
        .map(|output| output.text)
}

/// Reads every golden row.
fn rows() -> Vec<Row> {
    let text = fs::read_to_string(golden().join("spec.json")).expect("the goldens read");
    serde_json::from_str(&text).expect("the goldens parse")
}

/// Proves that every golden row gives TypeScript's text or error.
///
/// Covers: rust-show/spec-equals-typescript-s
#[test]
fn spec_equals_typescript() {
    for row in rows() {
        let root = scratch(&row.name, &row.root);
        let result = run(&root, &row.args);
        match row.code {
            0 => assert_eq!(
                result.expect("the row succeeds"),
                row.stdout,
                "row {}",
                row.name
            ),
            1 => {
                let error = result.expect_err("the row fails");
                assert!(
                    matches!(error, FeatureError::Failed { .. }),
                    "row {}",
                    row.name
                );
                assert_eq!(
                    error.to_string(),
                    format!(
                        "spec failed: {}",
                        row.stderr.strip_suffix('\n').unwrap_or(&row.stderr)
                    ),
                    "row {}",
                    row.name
                );
            }
            code => panic!("row {} has an unexpected code {code}", row.name),
        }
    }
}

/// Proves that an unreadable `spec.md` fails with the specs error.
///
/// Covers: rust-show/spec-read-failure
#[test]
fn spec_read_failure() {
    let root = scratch("spec-read-failure", "empty");
    let spec = root.join("openspec/specs/alpha/spec.md");
    fs::create_dir_all(&spec).expect("the spec folder is created");
    let error = run(&root, &["alpha".to_owned()]).expect_err("the row fails");
    assert!(matches!(error, FeatureError::Failed { .. }));
    assert!(
        error
            .to_string()
            .starts_with(&format!("spec failed: {}:", spec.display()))
    );
}

/// Proves that more than two arguments fail with the usage error.
///
/// Covers: rust-show/spec-argument-errors
#[test]
fn spec_argument_errors() {
    let root = scratch("spec-argument-errors", "empty");
    let args = ["a".to_owned(), "b".to_owned(), "c".to_owned()];
    let error = run(&root, &args).expect_err("the row fails");
    assert!(matches!(error, FeatureError::Usage { .. }));
    assert_eq!(
        error.to_string(),
        "usage of spec: expected [capability] [requirement]"
    );
}
