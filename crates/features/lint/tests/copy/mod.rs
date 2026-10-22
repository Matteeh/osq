//! Copying the lint fixture project into a fresh scratch root for one test row.

use std::fs;
use std::path::{Path, PathBuf};

/// Copies `tests/fixtures/lint-project` into a fresh scratch root named `name`.
pub fn fixture(name: &str) -> PathBuf {
    let source = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("lint-project");
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    copy_folder(&source, &root);
    root
}

/// Copies every file under `source` into `destination`, creating its folders.
fn copy_folder(source: &Path, destination: &Path) {
    let entries = fs::read_dir(source).expect("the fixture folder is read");
    for entry in entries.flatten() {
        let path = entry.path();
        let target = destination.join(entry.file_name());
        if path.is_dir() {
            fs::create_dir_all(&target).expect("the copied folder is created");
            copy_folder(&path, &target);
        } else {
            fs::copy(&path, &target).expect("the fixture file is copied");
        }
    }
}
