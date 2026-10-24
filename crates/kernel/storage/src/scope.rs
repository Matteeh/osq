//! Resolving a task's scope, hashing its files and refreshing its done marker,
//! as TypeScript's `resolveScope`, `computeTaskScopeHash` and
//! `refreshRecertifiedDoneMarker` do.
//!
//! Implements: rust-storage/task-scope-hash
//! Implements: rust-storage/done-marker-scope
//! Implements: rust-storage/done-marker-refresh

mod done;
mod yaml;

pub use done::{
    DoneMarkerError, DoneScope, differing_scope_paths, read_done_scope, refresh_done_marker,
};

use std::collections::HashMap;
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_specs::scope_covers_path;
use sha2::{Digest, Sha256};
use yaml_rust2::yaml::Hash;

/// One resolved scope entry: its project-relative path and file hash.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScopeFile {
    /// The project-relative POSIX path.
    pub path: String,
    /// `sha256:` and the hex digest, or none for a missing or unreadable file.
    pub hash: Option<String>,
}

/// A task's scope files and the digest folded over them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScopeHash {
    /// `sha256:` and the digest of the joined `path:hash` lines.
    pub hash: String,
    /// Every resolved file, sorted by path bytes.
    pub files: Vec<ScopeFile>,
}

/// One resolved entry together with the regular file it may be read from.
struct Resolved {
    /// The project-relative POSIX path.
    path: String,
    /// The readable file path, or none for an entry that is not a regular file.
    absolute: Option<PathBuf>,
}

/// Normalizes an entry: trimmed, POSIX, without a leading `./`, repeatedly.
///
/// Implements: rust-storage/task-scope-hash
fn normalize(entry: &str) -> String {
    let mut value = entry.trim().replace('\\', "/");
    while let Some(rest) = value.strip_prefix("./") {
        value = rest.to_owned();
    }
    value
}

/// True for a glob or a trailing-directory entry.
///
/// Implements: rust-storage/task-scope-hash
fn is_pattern(normalized: &str) -> bool {
    normalized.contains(['*', '?']) || normalized.ends_with('/')
}

/// True when a relative root stays strictly inside the project root.
///
/// Implements: rust-storage/task-scope-hash
fn stays_inside(root: &str) -> bool {
    root != ".." && !root.starts_with("../") && !Path::new(root).is_absolute()
}

/// Gives one path relative to `project`, with `/` separators.
///
/// Implements: rust-storage/task-scope-hash
fn relative(project: &Path, path: &Path) -> String {
    path.strip_prefix(project)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Collects every regular file below `dir`, symbolic links skipped.
///
/// Implements: rust-storage/task-scope-hash
fn walk(project: &Path, dir: &Path, files: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        let path = entry.path();
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            walk(project, &path, files);
        } else if kind.is_file() {
            files.push(relative(project, &path));
        }
    }
}

/// Resolves scope entries to project-relative paths, the first result winning.
///
/// Implements: rust-storage/task-scope-hash
fn resolve(project: &Path, scope: &[String]) -> Vec<Resolved> {
    let mut results: HashMap<String, Resolved> = HashMap::new();
    for raw in scope {
        let normalized = normalize(raw);
        if is_pattern(&normalized) {
            let root = match normalized.find(['*', '?']) {
                None => normalized.trim_end_matches('/'),
                Some(index) => {
                    let prefix = &normalized[..index];
                    match prefix.rfind('/') {
                        Some(slash) => &prefix[..slash],
                        None => "",
                    }
                }
            };
            if !stays_inside(root) {
                continue;
            }
            let base = if root.is_empty() {
                project.to_path_buf()
            } else {
                project.join(root)
            };
            let mut files = Vec::new();
            walk(project, &base, &mut files);
            let entries = [normalized.clone()];
            for path in files {
                if !scope_covers_path(&entries, &path) {
                    continue;
                }
                let absolute = project.join(&path);
                results.entry(path.clone()).or_insert(Resolved {
                    path,
                    absolute: Some(absolute),
                });
            }
            continue;
        }
        let outside =
            normalized.starts_with('/') || normalized == ".." || normalized.starts_with("../");
        let absolute = if outside {
            None
        } else {
            let path = project.join(&normalized);
            let regular = fs::symlink_metadata(&path).is_ok_and(|meta| meta.is_file());
            regular.then_some(path)
        };
        results.entry(normalized.clone()).or_insert(Resolved {
            path: normalized,
            absolute,
        });
    }
    let mut files: Vec<Resolved> = results.into_values().collect();
    files.sort_by(|left, right| left.path.as_bytes().cmp(right.path.as_bytes()));
    files
}

/// `sha256:` and the lowercase hex SHA-256 of a text.
///
/// Implements: rust-storage/task-scope-hash
fn digest(text: &[u8]) -> String {
    let hash = Sha256::digest(text);
    let mut hex = String::with_capacity(64);
    for byte in hash {
        let _ = write!(hex, "{byte:02x}");
    }
    format!("sha256:{hex}")
}

/// The hash of one regular file's text, or none when it cannot be read.
///
/// Implements: rust-storage/task-scope-hash
fn file_hash(absolute: Option<&Path>) -> Option<String> {
    let bytes = fs::read(absolute?).ok()?;
    let text = String::from_utf8_lossy(&bytes);
    Some(digest(text.as_bytes()))
}

/// Resolves the scope and folds its `path:hash` lines into one digest.
///
/// Implements: rust-storage/task-scope-hash
#[must_use]
pub fn task_scope_hash(project: &Path, scope: &[String]) -> ScopeHash {
    let files: Vec<ScopeFile> = resolve(project, scope)
        .into_iter()
        .map(|resolved| ScopeFile {
            hash: file_hash(resolved.absolute.as_deref()),
            path: resolved.path,
        })
        .collect();
    let canonical = files
        .iter()
        .map(|file| format!("{}:{}", file.path, file.hash.as_deref().unwrap_or("")))
        .collect::<Vec<_>>()
        .join("\n");
    ScopeHash {
        hash: digest(canonical.as_bytes()),
        files,
    }
}

/// Writes a frontmatter mapping as the `yaml` package's `stringify` does.
///
/// Implements: rust-storage/done-marker-refresh
#[must_use]
pub fn write_frontmatter(mapping: &Hash) -> String {
    yaml::write(mapping)
}
