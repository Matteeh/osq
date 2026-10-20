//! Walking a project for the regular files a scope pattern may match.

use std::fs;
use std::path::Path;

/// Lists every regular file under `project_root/root` as project-relative POSIX
/// paths, without following symbolic links.
pub(super) fn regular_files_under(project_root: &Path, root: &str) -> Vec<String> {
    let mut found = Vec::new();
    walk(&project_root.join(root), root, &mut found);
    found
}

/// Adds every regular file under `directory` to `found`, relative to `prefix`.
fn walk(directory: &Path, prefix: &str, found: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        let Some(name) = entry.file_name().to_str().map(ToOwned::to_owned) else {
            continue;
        };
        let relative = if prefix.is_empty() {
            name
        } else {
            format!("{prefix}/{name}")
        };
        if kind.is_dir() {
            walk(&entry.path(), &relative, found);
        } else if kind.is_file() {
            found.push(relative);
        }
    }
}
