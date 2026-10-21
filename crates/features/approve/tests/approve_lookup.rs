//! Proves the active change folder `approve` picks for a query.

mod support;

use support::{exists, run, scratch, valid_change, valid_change_at};

/// The active folders of the lookup fixture.
const FOLDERS: [&str; 4] = ["001-alpha", "012-beta", "012-beta-two", "x-y"];

/// Proves every row of "Approved folder for a query".
///
/// Covers: rust-approve/approved-folder-for-a-query
#[test]
fn approved_folder_for_a_query() {
    let rows: [(&str, Option<&str>); 10] = [
        ("1", Some("001-alpha")),
        ("001", Some("001-alpha")),
        ("  1  ", Some("001-alpha")),
        ("001-alpha", Some("001-alpha")),
        ("12", Some("012-beta")),
        ("012-beta-two", Some("012-beta")),
        ("x", Some("x-y")),
        ("x-y", Some("x-y")),
        ("3", None),
        ("alpha", None),
    ];
    for (index, (query, expected)) in rows.into_iter().enumerate() {
        let root = scratch(&format!("lookup-{index}"));
        for folder in FOLDERS {
            valid_change(&root, folder);
        }
        valid_change_at(&root, "archive/003-gamma");
        let result = run(&root, query);
        if let Some(folder) = expected {
            result.unwrap_or_else(|error| panic!("{query}: {error}"));
            for other in FOLDERS {
                let marker = format!("openspec/changes/{other}/.run/approved");
                assert_eq!(exists(&root, &marker), other == folder, "{query}: {other}");
            }
            assert!(
                !exists(&root, "openspec/changes/archive/003-gamma/.run/approved"),
                "{query}: the archived folder"
            );
        } else {
            let error = result.expect_err("the query names no active change");
            let changes = root.join("openspec").join("changes");
            assert_eq!(
                error.to_string(),
                format!(
                    "approve failed: Spec \"{query}\" not found in {}",
                    changes.display()
                ),
                "{query}"
            );
        }
    }
}
