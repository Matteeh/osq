//! Proves the listing of a project's change folders.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{Location, list_changes};

/// The directory holding every fixture project.
fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

/// Proves `list_changes` on the fixture project, then on ordering edges.
///
/// Covers: rust-storage/fixture-project-listing
#[test]
fn fixture_project_listing() {
    let listed: Vec<(String, Location)> = list_changes(&fixtures().join("project"))
        .iter()
        .map(|entry| (entry.folder.clone(), entry.location))
        .collect();
    let expected = [
        (String::from("003-beta"), Location::Active),
        (String::from("001-alpha"), Location::Archived),
        (String::from("002-plain"), Location::Archived),
        (String::from("010-late"), Location::Archived),
        (String::from("004-gamma"), Location::Rejected),
    ];
    assert_eq!(listed, expected);

    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join("listing_order");
    let _ = fs::remove_dir_all(&root);
    let changes = root.join("openspec/changes");
    for name in ["10-late", "2-b", "2-a", "beta", ".hidden", "_draft"] {
        fs::create_dir_all(changes.join(name)).unwrap();
    }
    let ordered: Vec<String> = list_changes(&root)
        .iter()
        .map(|entry| entry.folder.clone())
        .collect();
    assert_eq!(ordered, ["2-a", "2-b", "10-late", "beta"]);
}

/// Proves a project without `openspec/changes/` lists nothing.
///
/// Covers: rust-storage/missing-changes-folder
#[test]
fn missing_changes_folder() {
    let entries = list_changes(&fixtures());
    assert!(entries.is_empty(), "expected no entries, got {entries:?}");
}
