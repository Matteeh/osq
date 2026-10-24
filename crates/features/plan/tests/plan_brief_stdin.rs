//! Proves `plan <name> --brief -` reads the brief from standard input.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use osq_core::{Feature, Invocation};
use osq_feature_plan::PlanFeature;

/// The child test's scratch root variable.
const CHILD_ROOT: &str = "OSQ_PLAN_BRIEF_STDIN_CHILD_ROOT";
/// The child test's output file variable.
const CHILD_OUTPUT: &str = "OSQ_PLAN_BRIEF_STDIN_CHILD_OUTPUT";
/// The fixed time whose UTC date the golden brief records.
const TIME: i64 = 1_792_843_200_000;

/// The plan crate's test fixtures folder.
fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
}

/// The brief goldens folder.
fn goldens() -> PathBuf {
    fixtures().join("brief-created")
}

/// Creates a fresh scratch root for the test.
fn scratch() -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join("plan_brief_stdin");
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
fn files(base: &Path) -> std::collections::BTreeMap<PathBuf, Vec<u8>> {
    let mut files = std::collections::BTreeMap::new();
    collect(base, base, &mut files);
    files
}

/// Adds one folder's files, descending into its folders.
fn collect(base: &Path, folder: &Path, files: &mut std::collections::BTreeMap<PathBuf, Vec<u8>>) {
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

/// Runs the child test with the brief on its standard input.
fn run_child(root: &Path, brief: &[u8]) {
    let output_path = root.join("child-output.txt");
    let mut child = Command::new(std::env::current_exe().expect("the test binary resolves"))
        .args(["--exact", "brief_stdin_child", "--nocapture"])
        .env(CHILD_ROOT, root)
        .env(CHILD_OUTPUT, &output_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("the child test starts");
    child
        .stdin
        .take()
        .expect("the child has standard input")
        .write_all(brief)
        .expect("the brief is written to the child");
    let status = child.wait().expect("the child finishes");
    assert!(status.success(), "the child test passes");
}

/// Runs the plan for the parent test when its variables are set, else does nothing.
#[test]
fn brief_stdin_child() {
    let Ok(root) = std::env::var(CHILD_ROOT) else {
        return;
    };
    let output = PlanFeature::at(TIME)
        .run(&Invocation::new(
            Path::new(&root),
            "plan",
            ["Add dark mode!", "--brief", "-"]
                .iter()
                .map(|arg| (*arg).to_owned())
                .collect(),
        ))
        .expect("the plan succeeds")
        .text;
    let output_path = std::env::var(CHILD_OUTPUT).expect("the output path is set");
    fs::write(output_path, output).expect("the output is written");
}

/// Proves "Brief from standard input".
///
/// Covers: rust-plan/brief-from-standard-input
#[test]
fn brief_from_standard_input() {
    let root = scratch();
    copy_tree(&fixtures().join("plan-repo"), &root);
    let brief = fs::read(goldens().join("brief-in.md")).expect("the brief reads");
    run_child(&root, &brief);
    let folder = root.join("openspec/changes/005-add-dark-mode");
    assert_eq!(files(&folder), files(&goldens().join("005-add-dark-mode")));
    let output = fs::read_to_string(root.join("child-output.txt")).expect("the output reads");
    let expected = fs::read_to_string(goldens().join("handoff.txt"))
        .expect("the golden reads")
        .replace("<root>", &root.display().to_string());
    assert_eq!(output, expected);
}
