//! Reading living capabilities' Code ownership globs.

use super::glob::scope_covers_path;
use crate::markdown::code_ownership;
use serde::Serialize;
use std::path::Path;

/// One living capability's declared Code ownership globs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CapabilityOwnership {
    /// The capability folder's name.
    pub capability: String,
    /// The capability's Code ownership globs, in order.
    pub globs: Vec<String>,
}

/// The names of the entries directly under `specs_dir`, in no order.
fn directory_names(specs_dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(specs_dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect()
}

/// One capability's ownership, or none when its spec has no globs.
fn capability_ownership(specs_dir: &Path, name: &str) -> Option<CapabilityOwnership> {
    let spec = std::fs::read_to_string(specs_dir.join(name).join("spec.md")).ok()?;
    let globs = code_ownership(&spec);
    if globs.is_empty() {
        return None;
    }
    Some(CapabilityOwnership {
        capability: name.to_string(),
        globs,
    })
}

/// Reads every living capability's Code ownership, in folder name order by bytes.
///
/// Implements: rust-specs/capability-ownership
#[must_use]
pub fn read_capability_ownership(specs_dir: &Path) -> Vec<CapabilityOwnership> {
    let mut names = directory_names(specs_dir);
    names.sort();
    names
        .into_iter()
        .filter_map(|name| capability_ownership(specs_dir, &name))
        .collect()
}

/// The capability names whose globs cover one path, sorted by bytes.
///
/// Implements: rust-specs/capability-ownership
#[must_use]
pub fn owner_capabilities(ownerships: &[CapabilityOwnership], path: &str) -> Vec<String> {
    let mut owners: Vec<String> = ownerships
        .iter()
        .filter(|entry| scope_covers_path(&entry.globs, path))
        .map(|entry| entry.capability.clone())
        .collect();
    owners.sort();
    owners
}
