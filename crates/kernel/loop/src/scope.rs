//! Resolving the scope entries of a task file into the files they cover.
//!
//! Implements: rust-loop/scope-files

mod files;

use std::path::Path;

use osq_kernel_specs::{js_trim, scope_covers_path};

use crate::scope::files::regular_files_under;

/// The glob characters that make an entry a pattern.
const GLOB_CHARACTERS: [char; 2] = ['*', '?'];

/// One normalized scope entry: exact or a pattern.
enum Entry {
    /// An entry naming one path, which gives itself.
    Exact(String),
    /// An entry with glob characters or a trailing `/`, which gives its matches.
    Pattern(String),
}

impl Entry {
    /// Normalizes `raw` and classifies it as exact or a pattern.
    fn read(raw: &str) -> Self {
        let entry = js_trim(raw)
            .replace('\\', "/")
            .trim_start_matches("./")
            .to_string();
        if entry.contains(GLOB_CHARACTERS) || entry.ends_with('/') {
            Self::Pattern(entry)
        } else {
            Self::Exact(entry)
        }
    }
}

/// Resolves every scope entry against the regular files under `project_root`.
///
/// An exact entry gives itself. A pattern gives every file it matches beneath
/// its search root; one that matches no file, or whose search root leaves the
/// project, gives itself. The result has no duplicates and is sorted by bytes.
///
/// Implements: rust-loop/scope-files
#[must_use]
pub fn scope_files(project_root: &Path, scope: &[String]) -> Vec<String> {
    let mut found = Vec::new();
    for raw in scope {
        match Entry::read(raw) {
            Entry::Exact(entry) => found.push(entry),
            Entry::Pattern(entry) => {
                let root = match entry.find(GLOB_CHARACTERS) {
                    Some(index) => entry[..index]
                        .rfind('/')
                        .map_or("", |slash| &entry[..slash]),
                    None => entry.trim_end_matches('/'),
                };
                if root.starts_with("..") || root.starts_with('/') {
                    found.push(entry);
                    continue;
                }
                let mut matched = false;
                for file in regular_files_under(project_root, root) {
                    if scope_covers_path(std::slice::from_ref(&entry), &file) {
                        found.push(file);
                        matched = true;
                    }
                }
                if !matched {
                    found.push(entry);
                }
            }
        }
    }
    found.sort();
    found.dedup();
    found
}
