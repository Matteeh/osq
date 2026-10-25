//! Proves a run id core refuses gets core's change-id message.

mod support;

use osq_core::FeatureError;

use support::{FOLDER, run_args, status, tree};

/// The message core gives for the refused id `1]`.
const REFUSED: &str = "\"1]\" is not a change id; give the change's number, such as 7 or 007, or its full folder name";

/// Proves every row of "Run refuses an id that is not a change id".
///
/// Covers: rust-run/run-refuses-an-id-that-is-not-a-change-id
#[test]
fn run_refuses_an_id_that_is_not_a_change_id() {
    let rows: [([&str; 2], &str); 2] = [
        (["1]", "1"], REFUSED),
        (
            ["001-a-x", "1"],
            "Spec \"001-a-x\" not found in <root>/openspec/changes",
        ),
    ];
    for (index, (args, template)) in rows.into_iter().enumerate() {
        let root = support::repo(&format!("run_change_ids/{index}"));
        let folder = format!("openspec/changes/{FOLDER}");
        let before_tree = tree(&root, &folder);
        let before_status = status(&root);
        let error = run_args(&root, "run", &args).expect_err("the id names no active change");
        let expected = template.replace("<root>", &root.display().to_string());
        assert_eq!(
            error.to_string(),
            format!("run failed: {expected}"),
            "{args:?}"
        );
        match error {
            FeatureError::Failed { command, .. } => assert_eq!(command, "run", "{args:?}: command"),
            other => panic!("{args:?}: expected a failed error, got {other:?}"),
        }
        assert_eq!(tree(&root, &folder), before_tree, "{args:?}: folder");
        assert_eq!(status(&root), before_status, "{args:?}: git status");
    }
}
