//! Proves the active change folder `approve` picks for a query.

mod support;

use support::{exists, run, scratch, valid_change, valid_change_at};

/// The active folders of the lookup fixture.
const FOLDERS: [&str; 4] = ["001-alpha", "012-beta", "012-beta-two", "x-y"];

/// The forms core names when it refuses a change id.
const FORMS: &str = "give the change's number, such as 7 or 007, or its full folder name";

/// What one row of "Approved folder for a query" gives.
enum Expected {
    /// The row approves this folder.
    Approved(&'static str),
    /// The row fails with the not-found text.
    NotFound,
    /// The row fails with core's change-id message.
    Refused,
}

/// Proves every row of "Approved folder for a query".
///
/// Covers: rust-approve/approved-folder-for-a-query
#[test]
fn approved_folder_for_a_query() {
    let rows: [(&str, Expected); 13] = [
        ("1", Expected::Approved("001-alpha")),
        ("001", Expected::Approved("001-alpha")),
        ("  1  ", Expected::Approved("001-alpha")),
        ("001-alpha", Expected::Approved("001-alpha")),
        ("12", Expected::Approved("012-beta")),
        ("012-beta-two", Expected::Approved("012-beta-two")),
        ("x", Expected::NotFound),
        ("x-y", Expected::Approved("x-y")),
        ("3", Expected::NotFound),
        ("alpha", Expected::NotFound),
        ("012-beta-t", Expected::NotFound),
        ("1]", Expected::Refused),
        ("0O1", Expected::Refused),
    ];
    for (index, (query, expected)) in rows.into_iter().enumerate() {
        let root = scratch(&format!("lookup-{index}"));
        for folder in FOLDERS {
            valid_change(&root, folder);
        }
        valid_change_at(&root, "archive/003-gamma");
        let result = run(&root, query);
        match expected {
            Expected::Approved(folder) => {
                result.unwrap_or_else(|error| panic!("{query}: {error}"));
                for other in FOLDERS {
                    let marker = format!("openspec/changes/{other}/.run/approved");
                    assert_eq!(exists(&root, &marker), other == folder, "{query}: {other}");
                }
                assert!(
                    !exists(&root, "openspec/changes/archive/003-gamma/.run/approved"),
                    "{query}: the archived folder"
                );
            }
            Expected::NotFound => {
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
            Expected::Refused => {
                let error = result.expect_err("core refuses the query");
                assert_eq!(
                    error.to_string(),
                    format!("approve failed: \"{query}\" is not a change id; {FORMS}"),
                    "{query}"
                );
            }
        }
    }
}
