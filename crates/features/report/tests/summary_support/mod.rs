//! Helpers shared by the report summary tests.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_report::ReportFeature;

/// The crate's copied fixture projects and goldens.
pub fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/summary")
}

/// A fresh scratch folder under `CARGO_TARGET_TMPDIR`, named after its test.
pub fn scratch(test: &str, name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("report_summary")
        .join(test)
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch folder is created");
    fs::canonicalize(root).expect("the scratch folder resolves")
}

/// A fresh scratch copy of one fixture project.
pub fn project(test: &str, name: &str, project: &str) -> PathBuf {
    let root = scratch(test, name);
    copy_dir(&fixtures().join(project), &root);
    root
}

/// Reads one golden file exactly as it is stored.
pub fn golden(case: &str, extension: &str) -> String {
    fs::read_to_string(
        fixtures()
            .join("golden")
            .join(format!("{case}.{extension}")),
    )
    .expect("the golden reads")
}

/// Runs `report` with literal arguments on a root.
pub fn run(root: &Path, args: &[&str]) -> Result<String, FeatureError> {
    let args = args.iter().map(|arg| (*arg).to_owned()).collect();
    ReportFeature
        .run(&Invocation::new(root, "report", args))
        .map(|output| output.text)
}

/// The text after a `  Label:` line's colon and space.
pub fn field(text: &str, label: &str) -> String {
    let prefix = format!("  {label}: ");
    text.lines()
        .find_map(|line| line.strip_prefix(&prefix))
        .unwrap_or_else(|| panic!("no {label} line in {text}"))
        .to_owned()
}

/// Writes a file, creating its parent folders.
pub fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the parent folders are created");
    fs::write(path, text).expect("the file is written");
}

/// Copies a directory tree recursively, hidden entries included.
pub fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("the destination folder is created");
    for entry in fs::read_dir(from)
        .expect("the source folder reads")
        .flatten()
    {
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type reads").is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("the file is copied");
        }
    }
}
