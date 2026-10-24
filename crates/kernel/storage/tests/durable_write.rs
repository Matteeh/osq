//! Proves the durable replacement of a small state file.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use osq_kernel_storage::write_durable;

/// A fresh folder for one row, under the target's temp directory.
fn fresh_folder(row: &str) -> PathBuf {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("durable_writes")
        .join(row);
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).unwrap();
    folder
}

/// Asserts the row's folder holds no temporary file for `name`.
fn assert_no_temporary(folder: &Path, name: &str) {
    let temporary = folder.join(format!(".{name}.tmp"));
    assert!(!temporary.exists(), "left behind {}", temporary.display());
}

/// Proves the rows of the "Durable writes" table.
///
/// Covers: rust-storage/durable-writes
#[test]
fn durable_writes() {
    let folder = fresh_folder("new-file");
    let path = folder.join("cursor");
    assert!(write_durable(&path, b"new\n").is_ok());
    assert_eq!(fs::read(&path).unwrap(), b"new\n");
    assert_no_temporary(&folder, "cursor");

    let folder = fresh_folder("existing-file");
    let path = folder.join("cursor");
    fs::write(&path, b"old\n").unwrap();
    assert!(write_durable(&path, b"new\n").is_ok());
    assert_eq!(fs::read(&path).unwrap(), b"new\n");
    assert_no_temporary(&folder, "cursor");

    let folder = fresh_folder("missing-folder");
    let path = folder.join("missing/cursor");
    let error = write_durable(&path, b"new\n").unwrap_err();
    assert_eq!(error.kind(), ErrorKind::NotFound);
    assert!(!folder.join("missing").exists());
    assert_no_temporary(&folder, "cursor");

    let folder = fresh_folder("folder-target");
    let path = folder.join("cursor");
    fs::create_dir(&path).unwrap();
    assert!(write_durable(&path, b"new\n").is_err());
    assert!(path.is_dir());
    assert_no_temporary(&folder, "cursor");
}
