//! Rewriting a done marker in place after a passing recertification.

use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_specs::parse_frontmatter;
use yaml_rust2::Yaml;
use yaml_rust2::yaml::Hash;

use super::super::{scope, text, yaml};

/// The resolver version the recertified marker records.
const SCOPE_RESOLVER: i64 = 2;

/// Keeps the body and key order, then writes the current scope and timestamp.
///
/// # Errors
///
/// Returns a `Failed` error with the command `retry` when the marker cannot be
/// read, parsed or written.
///
/// Implements: rust-retry/recertified-done-marker
pub(crate) fn rewrite(
    folder: &Path,
    task: &str,
    recorded_hash: &str,
    current: &scope::ScopeHash,
    now: &str,
) -> Result<(), FeatureError> {
    let path = folder.join(".run").join("done").join(task);
    let original = fs::read_to_string(&path).map_err(|error| read_error(&path, &error))?;
    let frontmatter = parse_frontmatter(&original)
        .map_err(|error| text::failed(format!("line {}: {}", error.line, error.message)))?;
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

/// Keeps the first trusted hash as `original_scope_hash`.
///
/// Implements: rust-retry/recertified-done-marker
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
/// Implements: rust-retry/recertified-done-marker
fn files(current: &scope::ScopeHash) -> Yaml {
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
/// Implements: rust-retry/recertified-done-marker
fn count(data: &Hash) -> i64 {
    let count = match data.get(&Yaml::String("recertification_count".to_owned())) {
        Some(Yaml::Integer(number)) => (*number).max(0),
        _ => 0,
    };
    count + 1
}

/// Sets an existing key in place, else appends it at the end.
///
/// Implements: rust-retry/recertified-done-marker
fn set(data: &mut Hash, key: &str, value: Yaml) {
    let name = Yaml::String(key.to_owned());
    if let Some(slot) = data.get_mut(&name) {
        *slot = value;
    } else {
        data.insert(name, value);
    }
}

/// The failed error for a marker that cannot be read.
///
/// Implements: rust-retry/recertified-done-marker
fn read_error(path: &Path, error: &std::io::Error) -> FeatureError {
    text::failed(format!("cannot read {}: {error}", path.display()))
}

/// The failed error for a marker that cannot be written.
///
/// Implements: rust-retry/recertified-done-marker
fn write_error(path: &Path, error: &std::io::Error) -> FeatureError {
    text::failed(format!("cannot write {}: {error}", path.display()))
}
