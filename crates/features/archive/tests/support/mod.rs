//! Helpers shared by the archive feature's tests.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation, Output};
use osq_feature_archive::ArchiveFeature;

/// The fixture project every test copies.
pub fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/project")
}

/// A fresh scratch copy of the fixture under `CARGO_TARGET_TMPDIR`, named `name`.
pub fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("archive_feature")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    copy(&fixture(), &root);
    root
}

/// Copies every file and folder under `from` into `to`.
fn copy(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).unwrap();
        }
    }
}

/// Runs the archive feature's `archive` command with `args` at `root`.
pub fn run(root: &Path, args: &[&str]) -> Result<Output, FeatureError> {
    let invocation = Invocation::new(
        root,
        "archive",
        args.iter().map(|arg| (*arg).to_owned()).collect(),
    );
    ArchiveFeature.run(&invocation)
}

/// Every folder with no bytes and every file with its bytes, by relative path.
pub fn tree(root: &Path) -> BTreeMap<String, Option<Vec<u8>>> {
    let mut entries = BTreeMap::new();
    collect(root, root, &mut entries);
    entries
}

/// Adds one folder's entries and then their descendants to `entries`.
fn collect(root: &Path, dir: &Path, entries: &mut BTreeMap<String, Option<Vec<u8>>>) {
    let Ok(read) = fs::read_dir(dir) else {
        return;
    };
    for entry in read.flatten() {
        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        if path.is_dir() {
            entries.insert(relative, None);
            collect(root, &path, entries);
        } else {
            entries.insert(relative, Some(fs::read(&path).unwrap()));
        }
    }
}
