//! Reading the packages one change folder's task streams added.
//!
//! Implements: rust-storage/dependencies-added

use std::fs;
use std::path::Path;

use osq_kernel_specs::js_trim;
use serde_json::Value;

use super::stream;

/// One package added to one manifest.
///
/// Implements: rust-storage/dependencies-added
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DependencyPair {
    /// The manifest file, trimmed.
    pub file: String,
    /// The package name, trimmed.
    pub name: String,
}

/// Reads a change folder's distinct added packages, sorted by file then name.
///
/// Implements: rust-storage/dependencies-added
#[must_use]
pub fn read_dependencies_added(folder: &Path) -> Vec<DependencyPair> {
    let dir = folder.join(".run").join("events");
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };
    let names: Vec<String> = entries
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| is_event_file(name))
        .collect();
    let mut pairs = Vec::new();
    for name in names {
        let Ok(content) = fs::read_to_string(dir.join(name)) else {
            continue;
        };
        for event in stream::parse(&content) {
            if event.kind() == Some("dependencies_added") {
                pairs.extend(added_pairs(event.raw("added")));
            }
        }
    }
    pairs.sort_by(|left, right| {
        left.file
            .cmp(&right.file)
            .then_with(|| left.name.cmp(&right.name))
    });
    pairs.dedup();
    pairs
}

/// Whether a file name is digits followed by `.jsonl`.
fn is_event_file(name: &str) -> bool {
    let Some(stem) = name.strip_suffix(".jsonl") else {
        return false;
    };
    !stem.is_empty() && stem.bytes().all(|byte| byte.is_ascii_digit())
}

/// The valid pairs of one `added` member, or none when it is not an array.
fn added_pairs(added: Option<&Value>) -> Vec<DependencyPair> {
    let Some(Value::Array(items)) = added else {
        return Vec::new();
    };
    items.iter().filter_map(pair).collect()
}

/// One `{file, name}` entry trimmed, or `None` when either is not a string.
fn pair(value: &Value) -> Option<DependencyPair> {
    let object = value.as_object()?;
    let file = js_trim(object.get("file")?.as_str()?);
    let name = js_trim(object.get("name")?.as_str()?);
    if file.is_empty() || name.is_empty() {
        return None;
    }
    Some(DependencyPair {
        file: file.to_owned(),
        name: name.to_owned(),
    })
}
