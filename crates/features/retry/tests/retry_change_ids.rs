//! Proves retry refuses an id core does not read as a change id with core's
//! message, and keeps its own not-found text for a well-formed id.

mod support;

use support::{failed_message, run, scratch_copy, tree};

/// The message core gives for the id `1]`.
const REFUSED: &str = "\"1]\" is not a change id; give the change's number, such as 7 or 007, or its full folder name";

/// Proves every row of "Retry refuses an id that is not a change id".
///
/// Covers: rust-retry/retry-refuses-an-id-that-is-not-a-change-id
#[test]
fn retry_refuses_an_id_that_is_not_a_change_id() {
    let rows = [
        (["1]", "1"], REFUSED.to_owned()),
        (
            ["1]", "x"],
            "Invalid retry target \"x\": expected a numeric task or \"change\".".to_owned(),
        ),
        (
            ["001-dead-x", "1"],
            "Spec \"001-dead-x\" not found in <root>/openspec/changes".to_owned(),
        ),
    ];
    for (index, (args, message)) in rows.into_iter().enumerate() {
        let root = scratch_copy("retry_change_ids", &format!("row_{index}"));
        let before = tree(&root);
        let error = run(&root, args).expect_err("the retry is refused");
        assert_eq!(
            failed_message(error),
            message.replace("<root>", &root.display().to_string()),
            "{args:?}"
        );
        assert_eq!(tree(&root), before, "{args:?}: every file is unchanged");
    }
}
