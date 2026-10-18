//! Proves the delta and proposal reading edges beyond the spec tables fixture.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_specs::SpecsError;
use osq_kernel_storage::{ChangeEntry, Location, StorageError, read_change};

/// A fresh temporary project root, with anything at that name removed.
fn temp_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    root
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// An archived change entry of a temporary project root.
fn entry(root: &Path, folder: &str) -> ChangeEntry {
    ChangeEntry {
        folder: folder.to_owned(),
        location: Location::Archived,
        path: root.join("openspec/changes/archive").join(folder),
    }
}

/// Proves the delta folders sort by bytes and a folder without `spec.md` adds none.
///
/// Covers: rust-storage/deltas-of-the-spec-tables-fixture
#[test]
fn deltas_sort_and_skip() {
    let root = temp_root("deltas_sort");
    let dir = root.join("openspec/changes/archive/001-x");
    write(&dir.join("specs/z/spec.md"), "# Spec Delta: z\n");
    write(&dir.join("specs/a/spec.md"), "# Spec Delta: a\n");
    write(&dir.join("specs/empty/notes.txt"), "no spec here\n");
    write(&dir.join("specs/m.md"), "a file, not a folder\n");
    let snapshot = read_change(&entry(&root, "001-x")).unwrap();
    let capabilities: Vec<&str> = snapshot
        .deltas
        .iter()
        .map(|delta| delta.capability.as_str())
        .collect();
    assert_eq!(capabilities, ["a", "z"]);
}

/// Proves an unreadable delta `spec.md` fails the read with a specs error.
///
/// Covers: rust-storage/deltas-of-the-spec-tables-fixture
#[test]
fn unreadable_delta_spec() {
    let root = temp_root("unreadable_delta");
    let dir = root.join("openspec/changes/archive/001-x");
    write(&dir.join("specs/alpha/spec.md"), "# Spec Delta: alpha\n");
    fs::write(dir.join("specs/alpha/spec.md"), [0xff, 0xfe]).unwrap();
    let error = read_change(&entry(&root, "001-x")).unwrap_err();
    let StorageError::Specs(source) = &error else {
        panic!("expected a specs error, got {error:?}");
    };
    assert!(
        source.to_string().contains("specs/alpha/spec.md"),
        "message was {source}"
    );
}

/// Proves a change without a proposal reads an empty verify.
///
/// Covers: rust-storage/proposal-without-a-verify
#[test]
fn verify_without_a_proposal() {
    let root = temp_root("verify_no_proposal");
    let dir = root.join("openspec/changes/archive/001-x");
    fs::create_dir_all(&dir).unwrap();
    let snapshot = read_change(&entry(&root, "001-x")).unwrap();
    assert_eq!(snapshot.verify, "");
}

/// Proves a proposal the specs kernel refuses fails the read naming it.
///
/// Covers: rust-storage/refused-task-file
#[test]
fn refused_proposal() {
    let root = temp_root("refused_proposal");
    let dir = root.join("openspec/changes/archive/001-x");
    write(&dir.join("proposal.md"), "---\ntitle: a\nb: : :\n---\n");
    let error = read_change(&entry(&root, "001-x")).unwrap_err();
    let StorageError::Specs(source) = &error else {
        panic!("expected a specs error, got {error:?}");
    };
    assert!(
        source.to_string().contains("proposal.md"),
        "message was {source}"
    );
}

/// Proves a specs error speaks the specs kernel's message and is its source.
///
/// Covers: rust-storage/refused-task-file
#[test]
fn specs_error_speaks() {
    let inner = SpecsError::Read {
        path: PathBuf::from("x.md"),
        message: String::from("boom"),
    };
    let error = StorageError::Specs(inner.clone());
    assert_eq!(error.to_string(), inner.to_string());
    assert!(std::error::Error::source(&error).is_some());
}
