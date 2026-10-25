//! Proves the archive argument is a change id core reads, on fresh fixture copies.

mod support;

use support::{fixture, run, scratch, tree};

/// The message core gives for the argument `007]`.
const REFUSED: &str = "\"007]\" is not a change id; give the change's number, such as 7 or 007, or its full folder name";

/// Proves every row of "Change ids archive reads".
///
/// Covers: rust-archive/change-ids-archive-reads
#[test]
fn change_ids_archive_reads() {
    let rows = [
        ("7", None),
        ("  007  ", None),
        ("07-sample", Some("no active change 07-sample")),
        ("007]", Some(REFUSED)),
    ];
    for (index, (argument, refusal)) in rows.into_iter().enumerate() {
        let root = scratch(&format!("change_ids_{index}"));
        match (run(&root, &[argument]), refusal) {
            (Ok(_), None) => assert!(
                !tree(&root).contains_key("openspec/specs/beta"),
                "{argument} empties beta"
            ),
            (Err(error), Some(message)) => {
                assert_eq!(
                    error.to_string(),
                    format!("archive failed: {message}"),
                    "{argument}"
                );
                assert_eq!(tree(&root), tree(&fixture()), "{argument} writes nothing");
            }
            (other, expected) => panic!("{argument}: got {other:?}, expected refusal {expected:?}"),
        }
    }
}
