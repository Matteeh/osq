//! Helpers shared by the approve feature's tests.
//!
//! Each test binary compiles this module on its own, so some helpers are
//! unused in a given binary even though another test uses them.
#![allow(dead_code)]

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation, Output};
use osq_feature_approve::ApproveFeature;
use osq_kernel_storage::change_folder_seal;

/// A marker seal that is not the current seal of any test folder.
pub const OLD_SEAL: &str =
    "sha256:0000000000000000000000000000000000000000000000000000000000000000";

/// One event line for a task whose first attempt started.
pub const STARTED_EVENT: &str =
    r#"{"type":"started","timestamp":"2026-10-17T10:00:00.000Z","data":{"attempt":1}}"#;

/// The proposal every valid change folder holds.
const PROPOSAL: &str = "---\ntitle: A\n---\n";

/// The task file every valid change folder's tasks hold.
const TASK: &str = "---\ntitle: A\nverify: true\nscope: []\nentry: []\nskills: []\n---\n\
## Acceptance\n\n- [ ] A\n";

/// The delta spec every valid change folder holds.
const DELTA: &str = "## ADDED Requirements\n\n### Requirement: Alpha rests\n\
The system SHALL rest alpha.\n\n#### Scenario: Alpha rests\n\
- **WHEN** alpha stops\n- **THEN** alpha rests\n";

/// The path of one fixture folder under the crate's `tests/fixtures`.
pub fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join(name)
}

/// A fresh empty scratch root under `CARGO_TARGET_TMPDIR`, named `name`.
pub fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("approve_feature")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// A fresh scratch copy of a fixture, named `name`.
pub fn scratch_copy(fixture_name: &str, name: &str) -> PathBuf {
    let root = scratch(name);
    copy_tree(&fixture(fixture_name), &root);
    root
}

/// Copies a folder tree, dot folders and files included.
pub fn copy_tree(from: &Path, to: &Path) {
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

/// Writes one file under `root`, creating its folders.
pub fn write(root: &Path, relative: &str, contents: impl AsRef<[u8]>) {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the file's folders are created");
    }
    fs::write(path, contents).expect("the file is written");
}

/// Reads one file under `root`.
pub fn read(root: &Path, relative: &str) -> Vec<u8> {
    fs::read(root.join(relative)).expect("the file is read")
}

/// Whether a file or folder under `root` exists.
pub fn exists(root: &Path, relative: &str) -> bool {
    root.join(relative).exists()
}

/// Writes a valid change folder at `change`, relative to `openspec/changes`.
pub fn valid_change_at(root: &Path, change: &str) {
    let living = fixture("approve-repo").join("openspec/specs/alpha/spec.md");
    let living = fs::read_to_string(living).expect("the living alpha spec reads");
    write(root, "openspec/specs/alpha/spec.md", living);
    write(
        root,
        &format!("openspec/changes/{change}/proposal.md"),
        PROPOSAL,
    );
    write(root, &format!("openspec/changes/{change}/tasks/1.md"), TASK);
    write(
        root,
        &format!("openspec/changes/{change}/specs/alpha/spec.md"),
        DELTA,
    );
}

/// Writes a valid change folder named `folder` under `openspec/changes`.
pub fn valid_change(root: &Path, folder: &str) {
    valid_change_at(root, folder);
}

/// Adds one more valid task file to a change folder.
pub fn add_task(root: &Path, folder: &str, task: &str) {
    write(
        root,
        &format!("openspec/changes/{folder}/tasks/{task}.md"),
        TASK,
    );
}

/// Writes a marker whose frontmatter holds `lines`, and an empty file without any.
pub fn write_marker(root: &Path, folder: &str, relative: &str, lines: &[&str]) {
    let text = if lines.is_empty() {
        String::new()
    } else {
        format!("---\n{}\n---\n", lines.join("\n"))
    };
    write(root, &format!("openspec/changes/{folder}/{relative}"), text);
}

/// Writes `.run/approved` for a change folder with the exact bytes `text`.
pub fn write_approved(root: &Path, folder: &str, text: &str) {
    write(
        root,
        &format!("openspec/changes/{folder}/.run/approved"),
        text,
    );
}

/// The change folder's `.run/approved` bytes, or `None` without the marker.
pub fn marker_bytes(root: &Path, folder: &str) -> Option<Vec<u8>> {
    fs::read(
        root.join("openspec/changes")
            .join(folder)
            .join(".run/approved"),
    )
    .ok()
}

/// The seal `change_folder_seal` gives a change folder after a run.
pub fn current_seal(root: &Path, folder: &str) -> String {
    change_folder_seal(&root.join("openspec/changes").join(folder))
        .expect("the change folder seals")
        .as_str()
        .to_owned()
}

/// Every file under one folder, as relative path and bytes.
pub fn tree(root: &Path, relative: &str) -> BTreeMap<String, Vec<u8>> {
    let base = root.join(relative);
    let mut files = BTreeMap::new();
    collect(&base, &base, &mut files);
    files
}

/// Adds one folder's files to `files`, descending into its folders.
fn collect(base: &Path, folder: &Path, files: &mut BTreeMap<String, Vec<u8>>) {
    let Ok(entries) = fs::read_dir(folder) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect(base, &path, files);
        } else {
            let relative = path
                .strip_prefix(base)
                .expect("the file sits under the base folder")
                .to_string_lossy()
                .replace('\\', "/");
            files.insert(relative, fs::read(path).expect("the file is read"));
        }
    }
}

/// Runs the approve feature's `approve` with one query at `root`.
pub fn run(root: &Path, query: &str) -> Result<Output, FeatureError> {
    run_args(root, "approve", &[query])
}

/// Runs the approve feature's `command` with literal `args` at `root`.
pub fn run_args(root: &Path, command: &str, args: &[&str]) -> Result<Output, FeatureError> {
    let args = args.iter().map(|arg| (*arg).to_owned()).collect();
    ApproveFeature.run(&Invocation::new(root, command, args))
}
