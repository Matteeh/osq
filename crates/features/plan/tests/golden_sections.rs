//! Proves the prompt sections TypeScript printed for the history fixture.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_plan::PlanFeature;

/// The fixed time whose UTC date the golden brief records.
const TIME: i64 = 1_792_584_000_000;

/// The marker before the record and the sections after it.
const MARKER: &str = "\n\n## This repository's record";

/// The plan crate's test fixtures folder.
fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
}

/// Creates a fresh scratch root for the golden copy.
fn scratch() -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join("golden_sections");
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

/// The new change folder's `plan-prompt.md`.
fn new_prompt(root: &Path) -> String {
    let changes = root.join("openspec").join("changes");
    let folder = fs::read_dir(&changes)
        .expect("the changes folder reads")
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            path.is_dir()
                && path
                    .file_name()
                    .is_some_and(|name| name != "archive" && name != "rejected")
        })
        .expect("the new change folder exists");
    fs::read_to_string(folder.join("plan-prompt.md")).expect("the prompt reads")
}

/// Proves "Golden history sections" on a fresh copy of the fixture.
///
/// Covers: rust-plan/golden-history-sections
#[test]
fn golden_history_sections() {
    let root = scratch();
    copy_tree(&fixtures().join("sections/plan-history"), &root);
    PlanFeature::at(TIME)
        .run(&Invocation::new(&root, "plan", vec!["--next".to_owned()]))
        .expect("the history fixture's next item plans");
    let prompt = new_prompt(&root);
    let start = prompt.find(MARKER).expect("the record section exists") + 2;
    let expected = fs::read_to_string(fixtures().join("sections/plan-history.md"))
        .expect("the golden sections read");
    assert_eq!(&prompt[start..], expected, "golden history sections");
}
