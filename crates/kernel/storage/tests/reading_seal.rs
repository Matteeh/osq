//! Proves the seal of a change folder.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{StorageError, change_folder_seal};

/// The seal of an empty folder: SHA-256 of nothing.
const EMPTY_SEAL: &str = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/// The directory holding the seal fixture folders.
fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/seal")
}

/// The seal `hashChangeFolder` printed for a fixture folder.
fn golden(name: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden/seals.json");
    let json: serde_json::Value = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
    json[name].as_str().unwrap().to_owned()
}

/// Copies a folder, file by file, as bytes.
fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).unwrap();
        }
    }
}

/// A fresh temporary copy of the `plain` fixture named `case`.
fn plain_copy(case: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("reading_seal")
        .join(case);
    let _ = fs::remove_dir_all(&root);
    copy_dir(&fixtures().join("plain"), &root);
    root
}

/// Writes a file, creating its folders.
fn write(root: &Path, relative: &str, content: &str) {
    let path = root.join(relative);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, content).unwrap();
}

/// Proves each fixture folder has the seal `hashChangeFolder` printed.
///
/// Covers: rust-storage/fixture-folder-seals
#[test]
fn fixture_folder_seals() {
    for name in [
        "plain",
        "plan-prompt",
        "ticked",
        "undecodable",
        "unicode-order",
    ] {
        let seal = change_folder_seal(&fixtures().join(name)).unwrap();
        assert_eq!(seal.as_str(), golden(name), "folder {name}");
    }
}

/// Proves excluded paths, links and line endings leave the seal unchanged.
///
/// Covers: rust-storage/paths-left-out-of-the-seal
#[test]
fn paths_left_out_of_the_seal() {
    let expected = golden("plain");
    let marker = format!("sha256:{}", "a".repeat(64));
    let additions = [
        (".run/approved", marker.as_str()),
        (".git/HEAD", "ref: refs/heads/main"),
        ("specs/.DS_Store", "x"),
        ("specs/demo/.run/done/1", ""),
        ("plan-prompt.md", "prompt"),
    ];
    for (index, (path, content)) in additions.iter().enumerate() {
        let root = plain_copy(&format!("added{index}"));
        write(&root, path, content);
        let seal = change_folder_seal(&root).unwrap();
        assert_eq!(seal.as_str(), expected, "addition {path}");
    }

    let root = plain_copy("crlf");
    let proposal = fs::read_to_string(root.join("proposal.md")).unwrap();
    write(&root, "proposal.md", &proposal.replace('\n', "\r\n"));
    assert_eq!(change_folder_seal(&root).unwrap().as_str(), expected);
}

/// Proves a symbolic link is neither followed nor read.
///
/// Covers: rust-storage/paths-left-out-of-the-seal
#[cfg(unix)]
#[test]
fn symbolic_link_left_out() {
    let root = plain_copy("link");
    std::os::unix::fs::symlink("proposal.md", root.join("link.md")).unwrap();
    assert_eq!(change_folder_seal(&root).unwrap().as_str(), golden("plain"));
}

/// Proves an empty folder has the seal of no bytes.
///
/// Covers: rust-storage/empty-folder-seal
#[test]
fn empty_folder_seal() {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join("reading_seal/empty");
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    assert_eq!(change_folder_seal(&root).unwrap().as_str(), EMPTY_SEAL);
}

/// Proves a path that does not exist is an error naming it.
///
/// Covers: rust-storage/unreadable-change-folder
#[test]
fn unreadable_change_folder() {
    let missing = Path::new(env!("CARGO_TARGET_TMPDIR")).join("reading_seal/missing");
    let _ = fs::remove_dir_all(&missing);
    match change_folder_seal(&missing) {
        Err(StorageError::Read { path, .. }) => assert_eq!(path, missing),
        other => panic!("expected a read error, got {other:?}"),
    }
}
