//! Whether a change's dependencies count as done.

use std::fs;
use std::path::Path;

use osq_core::{ChangeId, parse_change_id};

/// Every dependency not yet done, in the order the proposal names them.
pub(crate) fn unmet(changes_dir: &Path, depends_on: &[String]) -> Vec<String> {
    depends_on
        .iter()
        .filter(|dependency| !done(changes_dir, dependency))
        .cloned()
        .collect()
}

/// Whether one dependency counts as done, as TypeScript's `isDependencyDone` does.
fn done(changes_dir: &Path, dependency: &str) -> bool {
    let Ok(id) = parse_change_id(dependency, false) else {
        return false;
    };
    if find_folder(&changes_dir.join("archive"), &id).is_some() {
        return true;
    }
    if find_folder(&changes_dir.join("rejected"), &id).is_some() {
        return false;
    }
    let Some(active) = find_folder(changes_dir, &id) else {
        return false;
    };
    let folder = changes_dir.join(active);
    let task_files = markdown_files(&folder.join("tasks"));
    if task_files.is_empty() {
        return false;
    }
    let done = directory_names(&folder.join(".run").join("done"));
    task_files
        .iter()
        .all(|task| done.iter().any(|entry| entry == task))
}

/// The first directory entry the id names.
fn find_folder(parent: &Path, id: &ChangeId) -> Option<String> {
    directory_names(parent)
        .into_iter()
        .find(|name| id.names(name))
}

/// The names of the entries in one directory, or none when it cannot be read.
fn directory_names(dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect()
}

/// The `tasks/*.md` stems in one task directory.
fn markdown_files(dir: &Path) -> Vec<String> {
    directory_names(dir)
        .into_iter()
        .filter_map(|name| name.strip_suffix(".md").map(ToOwned::to_owned))
        .collect()
}
