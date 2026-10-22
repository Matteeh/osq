//! Proves the lint feature's argument errors.

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
        ("lint", &[], "usage of lint: expected one change id, got 0"),
        (
            "lint",
            &["1", "2"],
            "usage of lint: expected one change id, got 2",
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
