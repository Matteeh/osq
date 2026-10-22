//! Reading one change folder's proposal and task presence, lock pids and
//! done-marker kinds.
//!
//! Implements: rust-storage/change-folder-files

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_specs::parse_frontmatter;
use serde_json::Value;
use yaml_rust2::Yaml;
use yaml_rust2::yaml::Hash;

/// The files of one change folder that doctor's checks read.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChangeFiles {
    /// Whether `proposal.md` or `spec.md` exists.
    pub has_proposal: bool,
    /// Whether `tasks` or `tasks.md` exists.
    pub has_tasks: bool,
    /// Every `.pid` entry of `.run/running`, then of `.run/locks`.
    pub locks: Vec<LockFile>,
    /// Every entry of `.run/done`, in name order.
    pub done_markers: Vec<DoneMarker>,
}

/// One lock file and the pid its JSON object holds.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LockFile {
    /// The lock file's path.
    pub path: PathBuf,
    /// The JSON integer `pid`, or `None` without one.
    pub pid: Option<i64>,
}

/// One done marker and whether it records a verified task.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DoneMarker {
    /// The marker file's path.
    pub path: PathBuf,
    /// Whether the frontmatter holds a scope hash or a manual reason.
    pub verified: bool,
}

/// Reads one change folder's files as doctor's checks read them; never fails.
///
/// Implements: rust-storage/change-folder-files
#[must_use]
pub fn read_change_files(folder: &Path) -> ChangeFiles {
    let run = folder.join(".run");
    ChangeFiles {
        has_proposal: exists_any(folder, &["proposal.md", "spec.md"]),
        has_tasks: exists_any(folder, &["tasks", "tasks.md"]),
        locks: lock_files(&run),
        done_markers: done_markers(&run),
    }
}

/// Whether any of the names exists directly under a folder.
fn exists_any(folder: &Path, names: &[&str]) -> bool {
    names.iter().any(|name| folder.join(name).exists())
}

/// Every `.pid` entry of `.run/running` and then of `.run/locks`.
fn lock_files(run: &Path) -> Vec<LockFile> {
    let mut locks = Vec::new();
    for name in ["running", "locks"] {
        let dir = run.join(name);
        for entry in sorted_names(&dir) {
            if !entry.as_bytes().ends_with(b".pid") {
                continue;
            }
            let path = dir.join(&entry);
            locks.push(LockFile {
                pid: read_pid(&path),
                path,
            });
        }
    }
    locks
}

/// Every entry of `.run/done`, with whether it records a verified task.
fn done_markers(run: &Path) -> Vec<DoneMarker> {
    let dir = run.join("done");
    sorted_names(&dir)
        .into_iter()
        .map(|name| {
            let path = dir.join(&name);
            let verified = fs::read_to_string(&path).is_ok_and(|text| marker_verified(&text));
            DoneMarker { path, verified }
        })
        .collect()
}

/// The names directly under one directory in byte order, or none.
fn sorted_names(dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect();
    names.sort();
    names
}

/// A lock file's integer pid, or `None` when it does not read as one.
fn read_pid(path: &Path) -> Option<i64> {
    let text = fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    value.as_object()?.get("pid")?.as_i64()
}

/// Whether a done marker's frontmatter records a verified task.
fn marker_verified(text: &str) -> bool {
    let Ok(frontmatter) = parse_frontmatter(text) else {
        return false;
    };
    let data = &frontmatter.data;
    string_field(data, "scope_hash").is_some()
        || (bool_field(data, "manual") && string_field(data, "reason").is_some())
}

/// A frontmatter key's string value, or `None` without one.
fn string_field(data: &Hash, key: &str) -> Option<String> {
    data.get(&Yaml::String(key.to_owned()))?
        .as_str()
        .map(ToOwned::to_owned)
}

/// Whether a frontmatter key holds the boolean `true`.
fn bool_field(data: &Hash, key: &str) -> bool {
    matches!(
        data.get(&Yaml::String(key.to_owned())),
        Some(Yaml::Boolean(true))
    )
}
