//! Proves reading `.run/manifest.json` into the typed manifest, and refusing
//! one that does not read.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{ChangeEntry, Location, StorageError, read_change};

/// What sits at a change's `.run/manifest.json` path.
#[derive(Clone, Copy)]
enum ManifestCase {
    /// No file at all.
    Absent,
    /// A file holding this text.
    Text(&'static str),
    /// A directory at the path.
    Directory,
}

/// A fresh temporary project root, with anything at that name removed.
fn temp_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    root
}

/// An active change folder holding only the given manifest shape.
fn change(root: &Path, case: ManifestCase) -> (ChangeEntry, PathBuf) {
    let path = root.join("openspec/changes/001-case");
    let manifest = path.join(".run/manifest.json");
    match case {
        ManifestCase::Absent => {}
        ManifestCase::Text(text) => {
            fs::create_dir_all(manifest.parent().unwrap()).unwrap();
            fs::write(&manifest, text).unwrap();
        }
        ManifestCase::Directory => fs::create_dir_all(&manifest).unwrap(),
    }
    fs::create_dir_all(&path).unwrap();
    let entry = ChangeEntry {
        folder: String::from("001-case"),
        location: Location::Active,
        path,
    };
    (entry, manifest)
}

/// Asserts that the error is a manifest refusal naming the manifest's path.
fn assert_manifest_refusal(error: &StorageError, manifest: &Path) {
    assert!(
        matches!(error, StorageError::Manifest { .. }),
        "expected a manifest refusal, got {error}"
    );
    let message = error.to_string();
    assert!(
        message.starts_with(&manifest.display().to_string()),
        "message {message} does not start with {}",
        manifest.display()
    );
}

/// Covers: rust-storage/manifest-files-read-or-refused
#[test]
fn no_manifest_reads_as_none() {
    let root = temp_root("manifest_absent");
    let (entry, _) = change(&root, ManifestCase::Absent);
    let snapshot = read_change(&entry).unwrap();
    assert_eq!(snapshot.planner, None);
    assert_eq!(snapshot.manifest_notices, None);
}

/// Covers: rust-storage/manifest-files-read-or-refused
#[test]
fn planner_is_trimmed_and_unknown_keys_are_ignored() {
    let root = temp_root("manifest_planner");
    let (entry, _) = change(
        &root,
        ManifestCase::Text(r#"{"planner": " ada ", "extra": 1}"#),
    );
    let snapshot = read_change(&entry).unwrap();
    assert_eq!(snapshot.planner.as_deref(), Some("ada"));
}

/// Covers: rust-storage/manifest-files-read-or-refused
#[test]
fn null_fields_read_as_none_and_empty_notices_read() {
    let root = temp_root("manifest_nulls");
    let (entry, _) = change(
        &root,
        ManifestCase::Text(
            r#"{"planner": null, "effort": null, "notices": {"items": [], "opened": null}}"#,
        ),
    );
    let snapshot = read_change(&entry).unwrap();
    assert_eq!(snapshot.planner, None);
    let notices = snapshot.manifest_notices.unwrap();
    assert_eq!(notices.items, Vec::new());
    assert_eq!(notices.opened, None);
}

/// Covers: rust-storage/manifest-files-read-or-refused
#[test]
fn text_that_is_not_json_is_a_manifest_refusal() {
    let root = temp_root("manifest_not_json");
    let (entry, manifest) = change(&root, ManifestCase::Text("{not json"));
    let error = read_change(&entry).unwrap_err();
    assert_manifest_refusal(&error, &manifest);
    assert!(std::error::Error::source(&error).is_some());
}

/// Covers: rust-storage/manifest-files-read-or-refused
#[test]
fn json_that_is_not_an_object_is_a_manifest_refusal() {
    let root = temp_root("manifest_array");
    let (entry, manifest) = change(&root, ManifestCase::Text("[]"));
    let error = read_change(&entry).unwrap_err();
    assert_manifest_refusal(&error, &manifest);
}

/// Covers: rust-storage/manifest-files-read-or-refused
#[test]
fn a_field_of_another_type_is_a_manifest_refusal() {
    let root = temp_root("manifest_bad_field");
    let (entry, manifest) = change(&root, ManifestCase::Text(r#"{"approvedAt": 5}"#));
    let error = read_change(&entry).unwrap_err();
    assert_manifest_refusal(&error, &manifest);
}

/// Covers: rust-storage/manifest-files-read-or-refused
#[test]
fn notices_without_items_is_a_manifest_refusal() {
    let root = temp_root("manifest_bad_notices");
    let (entry, manifest) = change(&root, ManifestCase::Text(r#"{"notices": {"opened": []}}"#));
    let error = read_change(&entry).unwrap_err();
    assert_manifest_refusal(&error, &manifest);
}

/// Covers: rust-storage/manifest-files-read-or-refused
#[test]
fn a_directory_at_the_manifest_path_is_a_read_error() {
    let root = temp_root("manifest_directory");
    let (entry, manifest) = change(&root, ManifestCase::Directory);
    let error = read_change(&entry).unwrap_err();
    match error {
        StorageError::Read { path, .. } => assert_eq!(path, manifest),
        other => panic!("expected a read error, got {other}"),
    }
}
