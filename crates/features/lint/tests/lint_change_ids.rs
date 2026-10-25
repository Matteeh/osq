//! Proves a lint id core refuses gets core's change-id message.

mod support;

use osq_core::FeatureError;

use support::{fixture, run_args_without_repository};

/// The message core gives for a refused id, naming `input`.
fn refused(input: &str) -> String {
    format!(
        "\"{input}\" is not a change id; give the change's number, such as 7 or 007, or its full folder name"
    )
}

/// Proves every row of "Lint refuses an id that is not a change id".
///
/// Covers: rust-lint/lint-refuses-an-id-that-is-not-a-change-id
#[test]
fn lint_refuses_an_id_that_is_not_a_change_id() {
    let root = fixture();
    let changes = root.join("openspec").join("changes");
    let rows: [(&[&str], String); 3] = [
        (&["1]"], refused("1]")),
        (&["1", "0O1"], refused("0O1")),
        (
            &["001-clean-x"],
            format!("Spec \"001-clean-x\" not found in {}", changes.display()),
        ),
    ];
    for (args, expected) in rows {
        let error = run_args_without_repository(&root, "lint", args)
            .expect_err("the id names no active change");
        assert_eq!(
            error.to_string(),
            format!("lint failed: {expected}"),
            "{args:?}"
        );
        match error {
            FeatureError::Failed { command, .. } => {
                assert_eq!(command, "lint", "{args:?}: command");
            }
            other => panic!("{args:?}: expected a failed error, got {other:?}"),
        }
    }
}
