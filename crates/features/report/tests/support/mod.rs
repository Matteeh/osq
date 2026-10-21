//! Helpers shared by the report feature's query tests.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation, Output};
use osq_feature_report::ReportFeature;
use serde_json::Value;

/// One golden query case from `tests/fixtures/queries.json`.
#[derive(Debug)]
pub struct GoldenCase {
    /// The case's name.
    pub name: String,
    /// The group the case belongs to, `run` or `authorize`.
    pub group: String,
    /// The fixture folder the case runs on.
    pub fixture: String,
    /// The select argument, or `None` for the table list.
    pub select: Option<String>,
    /// `output` or `failed`.
    pub result: String,
    /// The expected output or error message.
    pub text: String,
}

/// The path of the crate's `tests/fixtures` folder.
fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

/// All golden cases, in file order.
pub fn golden_cases() -> Vec<GoldenCase> {
    let text = fs::read_to_string(fixtures().join("queries.json")).unwrap();
    let cases: Vec<Value> = serde_json::from_str(&text).unwrap();
    cases
        .iter()
        .map(|case| GoldenCase {
            name: string(case, "name"),
            group: string(case, "group"),
            fixture: string(case, "fixture"),
            select: case
                .get("select")
                .and_then(Value::as_str)
                .map(str::to_owned),
            result: string(case, "result"),
            text: string(case, "text"),
        })
        .collect()
}

/// One string field of a golden case.
fn string(case: &Value, key: &str) -> String {
    case.get(key).and_then(Value::as_str).unwrap().to_owned()
}

/// A fresh scratch copy of a fixture, replacing any leftover folder of the name.
pub fn scratch(fixture: &str, name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    copy_dir(&fixtures().join(fixture), &root);
    fs::canonicalize(root).unwrap()
}

/// Copies a folder's entries, files and subfolders alike, into `target`.
fn copy_dir(source: &Path, target: &Path) {
    for entry in fs::read_dir(source).unwrap() {
        let entry = entry.unwrap();
        let destination = target.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            fs::create_dir_all(&destination).unwrap();
            copy_dir(&entry.path(), &destination);
        } else {
            fs::copy(entry.path(), destination).unwrap();
        }
    }
}

/// Runs the report feature's `query` with an optional select.
pub fn run(root: &Path, select: Option<&str>) -> Result<Output, FeatureError> {
    let args = select.map_or_else(Vec::new, |text| vec![text.to_owned()]);
    ReportFeature.run(&Invocation::new(root, "query", args))
}
