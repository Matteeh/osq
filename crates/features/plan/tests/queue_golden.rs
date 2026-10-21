//! Proves the queue text on the golden fixture TypeScript printed.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_plan::PlanFeature;

/// The plan crate's test fixtures folder.
fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
}

/// Creates a fresh scratch root for the golden copy.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Copies a folder tree, dot folders and files included.
fn copy_tree(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("the target folder is created");
    for entry in fs::read_dir(from).expect("the source folder is read") {
        let entry = entry.expect("the folder entry is read");
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type is read").is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("the file is copied");
        }
    }
}

/// Proves "Golden queue output" against a fresh scratch copy of the fixture.
///
/// Covers: rust-plan/golden-queue-output
#[test]
fn golden_queue_output() {
    let root = scratch("golden_queue_output");
    copy_tree(&fixtures().join("golden"), &root);
    let expected =
        fs::read_to_string(fixtures().join("queue.txt")).expect("the golden queue text is read");
    let output = PlanFeature::new()
        .run(&Invocation::new(&root, "queue", Vec::new()))
        .expect("the golden fixture's queue reads")
        .text;
    assert_eq!(format!("{output}\n"), expected, "golden queue output");
}
