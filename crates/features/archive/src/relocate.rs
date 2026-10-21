//! Moving an archived change folder into the archive and ticking its tasks.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::tick;

/// The planning prompt removed before the change is moved.
const PLAN_PROMPT: &str = "plan-prompt.md";

/// The archive folder under the project's `openspec/changes/`.
const ARCHIVE: &str = "openspec/changes/archive";

/// The first suffix a taken archive name tries.
const FIRST_SUFFIX: usize = 1;

/// Removes the planning prompt, moves `change` into the archive and ticks it,
/// returning the archived folder's path relative to `root` with `/`.
///
/// # Errors
///
/// Returns the operating system's error when the prompt, the archive folder,
/// the rename or a `tasks.md` fails.
///
/// Implements: rust-archive/archive-move
pub(crate) fn run(root: &Path, change: &Path) -> io::Result<String> {
    remove_plan_prompt(change)?;
    let archive = root.join(ARCHIVE);
    fs::create_dir_all(&archive)?;
    let target = free_target(&archive, &folder_name(change));
    fs::rename(change, &target)?;
    tick::folder(&target)?;
    Ok(relative(root, &target))
}

/// Removes the change's planning prompt, treating a missing one as removed.
fn remove_plan_prompt(change: &Path) -> io::Result<()> {
    let path = change.join(PLAN_PROMPT);
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

/// The change folder's name, as `path.basename` gives it.
fn folder_name(change: &Path) -> String {
    change
        .file_name()
        .map_or_else(String::new, |name| name.to_string_lossy().into_owned())
}

/// The archive path for `folder`, suffixed with the first free number if taken.
fn free_target(archive: &Path, folder: &str) -> PathBuf {
    let taken: Vec<String> = fs::read_dir(archive)
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|entry| entry.file_name().into_string().ok())
                .collect()
        })
        .unwrap_or_default();
    if !taken.iter().any(|name| name == folder) {
        return archive.join(folder);
    }
    let suffix = (FIRST_SUFFIX..=taken.len())
        .find(|number| {
            !taken
                .iter()
                .any(|name| name == &format!("{folder}-{number}"))
        })
        .unwrap_or(FIRST_SUFFIX);
    archive.join(format!("{folder}-{suffix}"))
}

/// A path relative to `root`, with every component joined by `/`.
fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}
