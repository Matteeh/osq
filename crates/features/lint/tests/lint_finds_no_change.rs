//! Proves the refusal for a query that names no active change.

mod support;

use osq_core::FeatureError;

use support::{fixture, run};

/// Proves every row of "Lint finds no change".
///
/// Covers: rust-lint/lint-finds-no-change
#[test]
fn lint_finds_no_change() {
    let root = fixture();
    let changes = root.join("openspec").join("changes");
    for query in ["9", "0", "clean", "x1"] {
        let error = run(&root, query).expect_err("the query names no active change");
        assert_eq!(
            error.to_string(),
            format!(
                "lint failed: Spec \"{query}\" not found in {}",
                changes.display()
            ),
            "{query}"
        );
        match error {
            FeatureError::Failed { command, .. } => {
                assert_eq!(command, "lint", "{query}: command");
            }
            other => panic!("{query}: expected a failed error, got {other:?}"),
        }
    }
}
