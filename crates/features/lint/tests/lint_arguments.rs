//! Proves the lint feature's argument errors and an empty run.

mod support;

use osq_core::FeatureError;

use support::{run_args, scratch};

/// Proves every row of "Lint argument errors".
///
/// Covers: rust-lint/lint-argument-errors
#[test]
fn lint_argument_errors() {
    let root = scratch("lint_argument_errors");
    let rows: [(&str, &[&str], &str); 3] = [
        ("lint", &["--yaml"], "usage of lint: unknown flag --yaml"),
        (
            "lint",
            &["1", "--json", "--fix"],
            "usage of lint: unknown flag --fix",
        ),
        ("approve", &["1"], "unknown command: approve"),
    ];
    for (command, args, text) in rows {
        let error = run_args(&root, command, args).expect_err("the invocation is refused");
        assert_eq!(error.to_string(), text, "{command} {args:?}");
        match (&error, command) {
            (FeatureError::Usage { command: name, .. }, "lint") => {
                assert_eq!(name, "lint", "{command} {args:?}: command");
            }
            (FeatureError::UnknownCommand { .. }, "approve") => {}
            other => panic!("{command} {args:?}: unexpected error {other:?}"),
        }
    }
}

/// Proves every row of "Lint with no change".
///
/// Covers: rust-lint/lint-with-no-change
#[test]
fn lint_with_no_change() {
    let rows: [(&str, &[&str]); 2] = [("none", &[]), ("repository", &["--repository"])];
    for (name, args) in rows {
        let root = scratch(&format!("lint_with_no_change/{name}"));
        let output = run_args(&root, "lint", args).expect("an empty root lints no change");
        assert_eq!(output.text, "", "{name}: text");
        assert_eq!(output.code, 0, "{name}: code");
    }
}
