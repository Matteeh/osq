//! Proves reject's usage errors before it reads any file.

mod support;

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;

use support::run_args;

/// A fresh scratch root under `CARGO_TARGET_TMPDIR`, named after its test.
fn scratch_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Proves every row of "Reject argument errors".
///
/// Covers: rust-approve/reject-argument-errors
#[test]
fn reject_argument_errors() {
    let root = scratch_root("reject_argument_errors");
    let rows: Vec<(&str, Vec<&str>, &str)> = vec![
        (
            "none",
            vec![],
            "usage of reject: expected <id> --reason <text>",
        ),
        (
            "one id",
            vec!["1"],
            "usage of reject: expected <id> --reason <text>",
        ),
        (
            "reason without a value",
            vec!["1", "--reason"],
            "usage of reject: expected <id> --reason <text>",
        ),
        (
            "reason without an id",
            vec!["--reason", "why"],
            "usage of reject: expected <id> --reason <text>",
        ),
        (
            "two ids",
            vec!["1", "2", "--reason", "why"],
            "usage of reject: expected <id> --reason <text>",
        ),
        (
            "two reasons",
            vec!["1", "--reason", "a", "--reason", "b"],
            "usage of reject: expected <id> --reason <text>",
        ),
        (
            "blank reason",
            vec!["1", "--reason", "   "],
            "usage of reject: a non-empty rejection reason is required",
        ),
    ];
    for (name, args, expected) in rows {
        let result = run_args(&root, "reject", &args);
        let error = result.expect_err("the invocation fails");
        assert_eq!(error.to_string(), expected, "{name}");
        match &error {
            FeatureError::Usage { command, .. } => {
                assert_eq!(command, "reject", "{name}: command");
            }
            other => panic!("{name}: expected a usage error, got {other:?}"),
        }
    }
    assert_eq!(
        fs::read_dir(&root).expect("the root reads").count(),
        0,
        "no file is written"
    );
}
