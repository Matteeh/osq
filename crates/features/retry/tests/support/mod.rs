//! Helpers shared by the retry feature's tests.
//!
//! Each test binary compiles this module on its own, so some helpers are
//! unused in a given binary even though another test uses them.
#![allow(dead_code)]

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation, Output};
use osq_feature_retry::RetryFeature;
use serde_json::{Map, Value};

/// The stale pid every live Linux and WSL process table lacks.
pub const STALE_PID: &str = "2147483646";

/// The path of one fixture folder under the crate's `tests/fixtures`.
pub fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join(name)
}

/// A fresh empty scratch root under `CARGO_TARGET_TMPDIR`.
pub fn scratch(group: &str, name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join(group)
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// A fresh scratch copy of the retry fixture, named after its row.
pub fn scratch_copy(group: &str, name: &str) -> PathBuf {
    let root = scratch(group, name);
    copy_tree(&fixture("retry-project"), &root);
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

/// The change folder of one scratch copy.
pub fn change_folder(root: &Path, folder: &str) -> PathBuf {
    root.join("openspec").join("changes").join(folder)
}

/// Runs the retry feature with two literal arguments at `root`.
pub fn run(root: &Path, args: [&str; 2]) -> Result<Output, FeatureError> {
    let args = args.iter().map(|arg| (*arg).to_owned()).collect();
    RetryFeature.run(&Invocation::new(root, "retry", args))
}

/// The `Failed` message of an error for the command `retry`.
pub fn failed_message(error: FeatureError) -> String {
    match error {
        FeatureError::Failed {
            command, message, ..
        } => {
            assert_eq!(command, "retry", "the failed command");
            message
        }
        other => panic!("expected a Failed retry error, got {other:?}"),
    }
}

/// Every file under `root`, as relative path and bytes.
pub fn tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut files = BTreeMap::new();
    collect(root, root, &mut files);
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
            let relative = relative(base, &path);
            files.insert(relative, fs::read(path).expect("the file is read"));
        }
    }
}

/// `path` relative to `base`, with `/` separators.
fn relative(base: &Path, path: &Path) -> String {
    path.strip_prefix(base)
        .expect("the file sits under the base folder")
        .to_string_lossy()
        .replace('\\', "/")
}

/// The golden dump of one change folder's `.run` tree, `running/` left out.
pub fn dump(folder: &Path) -> String {
    let mut files = tree(folder)
        .into_iter()
        .filter(|(path, _)| path.starts_with(".run/") && !path.starts_with(".run/running/"))
        .collect::<BTreeMap<_, _>>();
    let mut lines = Vec::new();
    for (path, bytes) in std::mem::take(&mut files) {
        let text = String::from_utf8(bytes).expect("the fixture file is UTF-8");
        lines.push(format!("--- {path}"));
        if path
            .rsplit_once('.')
            .is_some_and(|(_, extension)| extension == "jsonl")
        {
            for line in text.split('\n').filter(|line| !line.is_empty()) {
                lines.push(event_line(line));
            }
        } else {
            lines.push(text.strip_suffix('\n').unwrap_or(&text).to_owned());
        }
    }
    lines.join("\n")
}

/// One event line parsed, its timestamp blanked and its keys sorted.
fn event_line(line: &str) -> String {
    let mut value: Value = serde_json::from_str(line).expect("the event line is JSON");
    if let Value::Object(object) = &mut value
        && object.contains_key("timestamp")
    {
        object.insert(
            "timestamp".to_owned(),
            Value::String("<timestamp>".to_owned()),
        );
    }
    sorted(value).to_string()
}

/// `value` with every object's keys sorted, as `JSON.stringify` writes them.
fn sorted(value: Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.into_iter().map(sorted).collect()),
        Value::Object(object) => {
            let mut keys: Vec<String> = object.keys().cloned().collect();
            keys.sort();
            let mut result = Map::new();
            for key in keys {
                let item = object.get(&key).cloned().unwrap_or(Value::Null);
                result.insert(key, sorted(item));
            }
            Value::Object(result)
        }
        other => other,
    }
}

/// A golden's outcome, body and tree, split as `print-goldens.mjs` writes it.
pub fn parse_golden(text: &str) -> (String, String, String) {
    let (head, tree) = text.split_once("tree:\n").expect("the golden has a tree");
    let (outcome, body) = head.split_once('\n').expect("the golden has a body");
    let outcome = outcome
        .strip_prefix("outcome: ")
        .expect("the golden names its outcome");
    (outcome.to_owned(), body.to_owned(), tree.to_owned())
}
