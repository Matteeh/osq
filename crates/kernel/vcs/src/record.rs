//! The tree record: one JSON line for each write that can change a tree.

use std::fs;
use std::io::Write as _;
use std::path::Path;

/// The record file's name inside the repository's common git directory.
pub(crate) const TREE_RECORD_FILE: &str = "osq-trees.jsonl";

/// `text` as a JSON string literal, with the escapes `JSON.stringify` writes.
fn quoted(text: &str) -> String {
    serde_json::Value::String(text.to_owned()).to_string()
}

/// The one line written for `at`, `op` and `root`.
fn record_line(at: &str, op: &str, root: &Path) -> String {
    format!(
        "{{\"at\":{},\"op\":{},\"root\":{}}}\n",
        quoted(at),
        quoted(op),
        quoted(&root.display().to_string()),
    )
}

/// Appends one `{"at","op","root"}` line to `path`, ignoring every failure.
///
/// Implements: rust-vcs/tree-record
pub fn append_tree_record(path: &Path, at: &str, op: &str, root: &Path) {
    let line = record_line(at, op, root);
    let _ = fs::OpenOptions::new()
        .append(true)
        .create(true)
        .open(path)
        .and_then(|mut file| file.write_all(line.as_bytes()));
}
