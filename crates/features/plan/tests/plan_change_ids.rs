//! Proves `plan <id>` refuses an id core does not read as a change id with
//! core's message, and keeps its own refusal for a well-formed id.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation, Output};
use osq_feature_plan::PlanFeature;

/// The fixture project the steering tests copy.
fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/steer-project")
}

/// Creates a scratch root for one row, removing any left-over folder.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("plan_change_ids")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Copies a folder tree, dot folders and files included.
fn copy_tree(from: &Path, to: &Path) {
    for entry in fs::read_dir(from).expect("the fixture folder is read") {
        let entry = entry.expect("the fixture entry is read");
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type is read").is_dir() {
            fs::create_dir_all(&target).expect("the target folder is created");
            copy_tree(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("the fixture file is copied");
        }
    }
}

/// A fresh copy of the steering fixture under `CARGO_TARGET_TMPDIR`.
fn fixture_copy(name: &str) -> PathBuf {
    let root = scratch(name);
    copy_tree(&fixture(), &root);
    root
}

/// Every file under one root with its bytes, keyed by its relative path.
fn tree(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut files = BTreeMap::new();
    collect(root, root, &mut files);
    files
}

/// Appends every file under `folder` to `files`.
fn collect(base: &Path, folder: &Path, files: &mut BTreeMap<PathBuf, Vec<u8>>) {
    for entry in fs::read_dir(folder).expect("a folder is read") {
        let entry = entry.expect("an entry is read");
        let path = entry.path();
        if entry.file_type().expect("the entry type is read").is_dir() {
            collect(base, &path, files);
        } else {
            let relative = path.strip_prefix(base).expect("the path is under the root");
            files.insert(
                relative.to_path_buf(),
                fs::read(&path).expect("the file is read"),
            );
        }
    }
}

/// Runs `plan` with the given arguments.
fn run_plan(root: &Path, args: &[&str]) -> Result<Output, FeatureError> {
    PlanFeature::new().run(&Invocation::new(
        root,
        "plan",
        args.iter().map(|arg| (*arg).to_owned()).collect(),
    ))
}

/// Proves every row of "Steering refuses an id that is not a change id".
///
/// Covers: rust-plan/steering-refuses-an-id-that-is-not-a-change-id
#[test]
fn steering_refuses_an_id_that_is_not_a_change_id() {
    let rows = [
        (
            "8]",
            "\"8]\" is not a change id; give the change's number, such as 7 or 007, or its full folder name",
        ),
        (
            "009-unapproved-x",
            "No active change matching \"009-unapproved-x\" needs steering; Rust osq plan 009-unapproved-x steers a change only.",
        ),
    ];
    for (index, (id, expected)) in rows.into_iter().enumerate() {
        let root = fixture_copy(&format!("row_{index}"));
        let before = tree(&root);
        match run_plan(&root, &[id]) {
            Err(FeatureError::Failed {
                command, message, ..
            }) => assert_eq!(
                (command.as_str(), message.as_str()),
                ("plan", expected),
                "row {id}"
            ),
            other => panic!("row {id} expects a Failed error, got {other:?}"),
        }
        assert_eq!(tree(&root), before, "row {id} writes nothing");
    }
}
