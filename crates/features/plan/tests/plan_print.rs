//! Proves `plan --print` returns the prompt and writes no `plan-prompt.md`.

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

/// The steering goldens folder.
fn goldens() -> PathBuf {
    fixtures().join("steer-golden")
}

/// Creates a fresh scratch root for one row.
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
        files.insert(relative, fs::read(&path).expect("the file is read"));
    }
}

/// Runs `plan` with the given arguments.
fn run_plan(root: &Path, args: &[&str]) -> String {
    PlanFeature::at(TIME)
        .run(&Invocation::new(
            root,
            "plan",
            args.iter().map(|arg| (*arg).to_owned()).collect(),
        ))
        .expect("the plan succeeds")
        .text
}

/// Proves every row of "Printed next prompt".
///
/// Covers: rust-plan/printed-next-prompt
#[test]
fn printed_next_prompt() {
    let rows: [(&str, &[&str]); 2] = [
        ("print after next", &["--next", "--print"]),
        ("short print before next", &["-p", "--next"]),
    ];
    let created = fixtures().join("plan-created").join("005-beta");
    let prompt = fs::read(created.join("plan-prompt.md")).expect("the golden prompt reads");
    for (name, args) in rows {
        let root = scratch(&format!("printed_next_prompt/{}", name.replace(' ', "_")));
        copy_tree(&fixtures().join("plan-repo"), &root);
        let output = run_plan(&root, args);
        let mut expected = prompt.clone();
        expected.push(b'\n');
        assert_eq!(output.as_bytes(), expected.as_slice(), "row {name} output");

        let mut expected_files = files(&created);
        expected_files.remove(Path::new("plan-prompt.md"));
        let folder = root.join("openspec").join("changes").join("005-beta");
        assert_eq!(files(&folder), expected_files, "row {name} folder files");
    }
}

/// Proves "Printed steering prompt".
///
/// Covers: rust-plan/printed-steering-prompt
#[test]
fn printed_steering_prompt() {
    let root = scratch("printed_steering_prompt/001");
    copy_tree(&fixtures().join("steer-project"), &root);
    let before = files(&root);
    let output = run_plan(&root, &["001", "--print"]);
    let template =
        fs::read_to_string(goldens().join("blocked-001.prompt.txt")).expect("the golden reads");
    let expected = format!(
        "{}\n",
        template.replace("<root>", &root.display().to_string())
    );
    assert_eq!(output, expected, "row 001 output");
    assert_eq!(files(&root), before, "row 001 writes no file");
}
