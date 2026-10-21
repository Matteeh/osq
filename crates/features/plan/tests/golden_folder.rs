//! Proves the golden change folder and handoff TypeScript wrote.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_plan::PlanFeature;

/// The fixed time whose UTC date the golden brief records.
const TIME: i64 = 1_792_584_000_000;

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

/// Reads every file under a folder into its relative path and bytes.
fn files(base: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut files = BTreeMap::new();
    collect(base, base, &mut files);
    files
}

/// Adds one folder's files, descending into its folders.
fn collect(base: &Path, folder: &Path, files: &mut BTreeMap<PathBuf, Vec<u8>>) {
    for entry in fs::read_dir(folder).expect("the folder is read") {
        let entry = entry.expect("the folder entry is read");
        let path = entry.path();
        if entry.file_type().expect("the entry type is read").is_dir() {
            collect(base, &path, files);
            continue;
        }
        let relative = path
            .strip_prefix(base)
            .expect("the file sits under the base folder")
            .to_owned();
        let bytes = fs::read(&path).expect("the file is read");
        files.insert(relative, bytes);
    }
}

/// Proves "Golden change folder" against a fresh scratch copy of the fixture.
///
/// Covers: rust-plan/golden-change-folder
#[test]
fn golden_change_folder() {
    let root = scratch("golden_change_folder");
    copy_tree(&fixtures().join("plan-repo"), &root);
    let created = fixtures().join("plan-created");
    let output = PlanFeature::at(TIME)
        .run(&Invocation::new(&root, "plan", vec!["--next".to_owned()]))
        .expect("the golden fixture's next item plans");
    let expected_files = files(&created.join("005-beta"));
    let actual_files = files(&root.join("openspec").join("changes").join("005-beta"));
    assert_eq!(actual_files, expected_files, "golden change folder files");
    let template =
        fs::read_to_string(created.join("handoff.txt")).expect("the golden handoff reads");
    let expected = template.replace("<root>", &root.display().to_string());
    assert_eq!(output.text, expected, "golden handoff");
}
