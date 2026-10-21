//! The archive record and its put-back.

use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// The living specs folder under the project root.
const SPECS: &str = "openspec/specs";

/// The change's delta specs folder.
const DELTAS: &str = "specs";

/// The record file inside a change's run folder.
const RECORD: &str = ".run/archive-specs.json";

/// The two living files recorded for every delta capability.
const RECORDED_FILES: [&str; 2] = ["spec.md", "osq.yml"];

/// Each recorded path's text, or none when the file could not be read.
type Record = BTreeMap<String, Option<String>>;

/// The path of a change folder's transient archive record.
///
/// Implements: rust-archive/archive-record
pub(crate) fn path(change: &Path) -> PathBuf {
    change.join(RECORD)
}

/// Whether the change already holds the record a stopped archive left.
///
/// Implements: rust-archive/archive-record
pub(crate) fn exists(change: &Path) -> bool {
    path(change).is_file()
}

/// Writes the record of the living files the change is about to overwrite.
///
/// # Errors
///
/// Returns the operating system's error when the record cannot be written.
///
/// Implements: rust-archive/archive-record
pub(crate) fn write(root: &Path, change: &Path) -> io::Result<()> {
    let record = collect(root, change);
    let text = serde_json::to_string(&record).map_err(io::Error::other)?;
    fs::write(path(change), text)
}

/// Puts every recorded living file back, ignoring every failure.
///
/// Implements: rust-archive/archive-put-back
pub(crate) fn restore(root: &Path, change: &Path) {
    let path = path(change);
    let Ok(text) = fs::read_to_string(&path) else {
        return;
    };
    let record: Record = serde_json::from_str(&text).unwrap_or_default();
    for (relative, content) in record {
        let target = root.join(&relative);
        match content {
            Some(text) => put_back(&target, &text),
            None => remove_recorded(&target),
        }
    }
    let _ = fs::remove_file(path);
}

/// Removes the record a successful archive no longer needs.
///
/// Implements: rust-archive/archive-record
pub(crate) fn remove(change: &Path) {
    let _ = fs::remove_file(path(change));
}

/// Records each living file of every delta capability.
fn collect(root: &Path, change: &Path) -> Record {
    let mut record = Record::new();
    for capability in capabilities(change) {
        for name in RECORDED_FILES {
            let relative = format!("{SPECS}/{capability}/{name}");
            let path = root.join(&relative);
            record.insert(relative, fs::read_to_string(path).ok());
        }
    }
    record
}

/// Every capability folder directly under the change's delta specs folder.
fn capabilities(change: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(change.join(DELTAS)) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect()
}

/// Writes one recorded text, creating the folder it lives in.
fn put_back(path: &Path, text: &str) {
    if let Some(folder) = path.parent() {
        let _ = fs::create_dir_all(folder);
    }
    let _ = fs::write(path, text);
}

/// Removes one path recorded as absent and then its folder when empty.
fn remove_recorded(path: &Path) {
    let _ = fs::remove_file(path);
    if let Some(folder) = path.parent() {
        let _ = fs::remove_dir(folder);
    }
}
