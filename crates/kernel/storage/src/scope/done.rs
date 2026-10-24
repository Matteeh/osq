//! Reading and rewriting the scope a task's done marker records.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::fs;
use std::path::Path;

use osq_kernel_specs::parse_frontmatter;
use yaml_rust2::Yaml;
use yaml_rust2::yaml::Hash;

use super::ScopeHash;
use super::yaml;

/// The resolver version the recertified marker records.
const SCOPE_RESOLVER: i64 = 2;

/// The scope one done marker records.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DoneScope {
    /// The `sha256:` hash the marker recorded.
    pub scope_hash: String,
    /// Each recorded path and its hash, or none when it recorded no hash.
    pub scope_files: BTreeMap<String, Option<String>>,
}

/// Why a done marker could not be refreshed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DoneMarkerError {
    /// The display text, naming the marker's path and what failed.
    message: String,
}

impl fmt::Display for DoneMarkerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for DoneMarkerError {}

/// Reads the scope a done marker records; never fails.
///
/// Implements: rust-storage/done-marker-scope
#[must_use]
pub fn read_done_scope(folder: &Path, task: &str) -> Option<DoneScope> {
    let path = folder.join(".run").join("done").join(task);
    let text = fs::read_to_string(path).ok()?;
    let frontmatter = parse_frontmatter(&text).ok()?;
    let scope_hash = string_field(&frontmatter.data, "scope_hash")?;
    Some(DoneScope {
        scope_hash,
        scope_files: recorded_files(&frontmatter.data),
    })
}

/// The paths whose recorded hash differs from the current scope, in byte order.
///
/// Implements: rust-storage/done-marker-scope
#[must_use]
pub fn differing_scope_paths(
    recorded: &BTreeMap<String, Option<String>>,
    current: &ScopeHash,
) -> Vec<String> {
    let mut paths: BTreeSet<&str> = recorded.keys().map(String::as_str).collect();
    paths.extend(current.files.iter().map(|file| file.path.as_str()));
    let mut differing = Vec::new();
    for path in paths {
        let before = recorded.get(path).and_then(|hash| hash.as_deref());
        let after = current
            .files
            .iter()
            .find(|file| file.path == path)
            .and_then(|file| file.hash.as_deref());
        if before == after {
            continue;
        }
        let kind = if before.is_none() {
            "added"
        } else if after.is_none() {
            "deleted"
        } else {
            "modified"
        };
        differing.push(format!("{path} ({kind})"));
    }
    differing
}

/// Rewrites a done marker after a passing recertification.
///
/// # Errors
///
/// Returns a `DoneMarkerError` when the marker cannot be read, parsed or
/// written.
///
/// Implements: rust-storage/done-marker-refresh
pub fn refresh_done_marker(
    folder: &Path,
    task: &str,
    recorded_hash: &str,
    current: &ScopeHash,
    now: &str,
) -> Result<(), DoneMarkerError> {
    let path = folder.join(".run").join("done").join(task);
    let original = fs::read_to_string(&path).map_err(|error| read_error(&path, &error))?;
    let frontmatter = parse_frontmatter(&original).map_err(|error| parse_error(&error))?;
    let mut data = frontmatter.data;
    set_original(&mut data, recorded_hash);
    set(&mut data, "scope_hash", Yaml::String(current.hash.clone()));
    set(&mut data, "scope_files", files(current));
    set(&mut data, "scope_resolver", Yaml::Integer(SCOPE_RESOLVER));
    set(&mut data, "recertified_at", Yaml::String(now.to_owned()));
    let recertification_count = count(&data);
    set(
        &mut data,
        "recertification_count",
        Yaml::Integer(recertification_count),
    );
    let rewritten = format!("---\n{}---\n{}", yaml::write(&data), frontmatter.body);
    fs::write(&path, rewritten).map_err(|error| write_error(&path, &error))
}

/// A top-level key's non-empty string value, or none.
///
/// Implements: rust-storage/done-marker-scope
fn string_field(data: &Hash, key: &str) -> Option<String> {
    match data.get(&Yaml::String(key.to_owned())) {
        Some(Yaml::String(text)) if !text.is_empty() => Some(text.clone()),
        _ => None,
    }
}

/// The `scope_files` mapping, or an empty map for any other value.
///
/// Implements: rust-storage/done-marker-scope
fn recorded_files(data: &Hash) -> BTreeMap<String, Option<String>> {
    let Some(Yaml::Hash(mapping)) = data.get(&Yaml::String("scope_files".to_owned())) else {
        return BTreeMap::new();
    };
    mapping
        .iter()
        .map(|(key, value)| {
            let hash = value.as_str().map(ToOwned::to_owned);
            (key_text(key), hash)
        })
        .collect()
}

/// A YAML key's text, an integer key as its decimal text.
///
/// Implements: rust-storage/done-marker-scope
fn key_text(key: &Yaml) -> String {
    match key {
        Yaml::Integer(number) => number.to_string(),
        Yaml::String(text) | Yaml::Real(text) => text.clone(),
        Yaml::Boolean(flag) => String::from(if *flag { "true" } else { "false" }),
        Yaml::Null | Yaml::BadValue | Yaml::Alias(_) => String::from("null"),
        Yaml::Array(_) | Yaml::Hash(_) => String::new(),
    }
}

/// Keeps the first trusted hash as `original_scope_hash`.
///
/// Implements: rust-storage/done-marker-refresh
fn set_original(data: &mut Hash, recorded_hash: &str) {
    let present = data
        .get(&Yaml::String("original_scope_hash".to_owned()))
        .is_some_and(|value| matches!(value, Yaml::String(hash) if !hash.is_empty()));
    if !present {
        set(
            data,
            "original_scope_hash",
            Yaml::String(recorded_hash.to_owned()),
        );
    }
}

/// The mapping of each resolved path to its hash or `null`.
///
/// Implements: rust-storage/done-marker-refresh
fn files(current: &ScopeHash) -> Yaml {
    let mut mapping = Hash::new();
    for file in &current.files {
        let hash = match &file.hash {
            Some(hash) => Yaml::String(hash.clone()),
            None => Yaml::Null,
        };
        mapping.insert(Yaml::String(file.path.clone()), hash);
    }
    Yaml::Hash(mapping)
}

/// One more than a positive integer count, or one.
///
/// Implements: rust-storage/done-marker-refresh
fn count(data: &Hash) -> i64 {
    let count = match data.get(&Yaml::String("recertification_count".to_owned())) {
        Some(Yaml::Integer(number)) => (*number).max(0),
        _ => 0,
    };
    count + 1
}

/// Sets an existing key in place, else appends it at the end.
///
/// Implements: rust-storage/done-marker-refresh
fn set(data: &mut Hash, key: &str, value: Yaml) {
    let name = Yaml::String(key.to_owned());
    if let Some(slot) = data.get_mut(&name) {
        *slot = value;
    } else {
        data.insert(name, value);
    }
}

/// The error for a marker that cannot be read.
///
/// Implements: rust-storage/done-marker-refresh
fn read_error(path: &Path, error: &std::io::Error) -> DoneMarkerError {
    DoneMarkerError {
        message: format!("cannot read {}: {error}", path.display()),
    }
}

/// The error for a frontmatter that does not parse.
///
/// Implements: rust-storage/done-marker-refresh
fn parse_error(error: &osq_kernel_specs::SyntaxError) -> DoneMarkerError {
    DoneMarkerError {
        message: format!("line {}: {}", error.line, error.message),
    }
}

/// The error for a marker that cannot be written.
///
/// Implements: rust-storage/done-marker-refresh
fn write_error(path: &Path, error: &std::io::Error) -> DoneMarkerError {
    DoneMarkerError {
        message: format!("cannot write {}: {error}", path.display()),
    }
}
