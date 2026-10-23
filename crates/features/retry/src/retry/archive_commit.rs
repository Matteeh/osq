//! Making the archive commit a failed archive left for a human retry.

use std::collections::BTreeSet;
use std::fmt;
use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_storage::{ChangeEntry, read_change};
use osq_kernel_vcs::{GitVcs, StatusEntry, Vcs, VcsError};

use super::args::CHANGE;
use super::record::Snapshot;
use super::text;
use super::vcs_detail;

/// The changes folder under a tree's root.
const CHANGES: &str = "openspec/changes";

/// The archive folder under a tree's changes folder.
const ARCHIVE: &str = "openspec/changes/archive";

/// The living specs folder under a tree's root.
const SPECS: &str = "openspec/specs";

/// Commits the whole archive in place of the `land retry` commit.
///
/// # Errors
///
/// Returns a `Failed` error with the command `retry` when git status, a
/// put-back, the record's restaging or the archive commit fails.
///
/// Implements: rust-retry/archived-retry
pub(crate) fn run(
    tree_root: &Path,
    folder: &Path,
    entry: &ChangeEntry,
    id: &str,
    config: &Config,
    snapshot: &Snapshot,
) -> Result<(), FeatureError> {
    let vcs = GitVcs::new(tree_root).with_timeouts(&config.timeouts);
    let status = vcs.status().map_err(|error| failed(&error))?;
    let old = relative(tree_root, &tree_root.join(CHANGES).join(&entry.folder));
    let archive_path = relative(tree_root, folder);
    let selected = paths(&status, &[&old, ARCHIVE, SPECS]);
    let refs: Vec<&str> = selected.iter().map(String::as_str).collect();
    for path in &selected {
        restore_deleted(&vcs, tree_root, path)?;
    }
    let title = read_change(entry).ok().and_then(|snapshot| snapshot.title);
    let author = config.vcs.author.as_deref().unwrap_or_default();
    let message = message(id, title.as_deref(), &archive_path, &entry.folder);
    match vcs.commit(&refs, &message, author) {
        Ok(_) => Ok(()),
        Err(error) => {
            restore_snapshot(&vcs, tree_root, folder, snapshot);
            Err(failed(&error))
        }
    }
}

/// Writes `HEAD`'s text for a deleted path, stages it, then removes it again.
///
/// Implements: rust-retry/archived-retry
fn restore_deleted(vcs: &GitVcs, root: &Path, path: &str) -> Result<(), FeatureError> {
    let target = root.join(path);
    if target.exists() {
        return Ok(());
    }
    let Some(contents) = vcs.show("HEAD", path).map_err(|error| failed(&error))? else {
        return Ok(());
    };
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| write_failed(&target, &error))?;
    }
    fs::write(&target, contents).map_err(|error| write_failed(&target, &error))?;
    let staged = vcs.stage(&[path]);
    let _ = fs::remove_file(&target);
    staged.map_err(|error| failed(&error))
}

/// Puts the archived folder's record files back as they were before the retry.
///
/// Implements: rust-retry/archived-retry
fn restore_snapshot(vcs: &GitVcs, root: &Path, folder: &Path, snapshot: &Snapshot) {
    let regressed = folder.join(".run").join("regressed");
    let _ = fs::remove_dir_all(&regressed);
    let _ = fs::create_dir_all(&regressed);
    for (name, contents) in &snapshot.regressed {
        let _ = fs::write(regressed.join(name), contents);
    }
    let events = folder
        .join(".run")
        .join("events")
        .join(format!("{CHANGE}.jsonl"));
    match &snapshot.events {
        Some(contents) => {
            if let Some(parent) = events.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&events, contents);
        }
        None => {
            let _ = fs::remove_file(&events);
        }
    }
    let regressed_path = relative(root, &regressed);
    let events_path = relative(root, &events);
    let _ = vcs.stage(&[&regressed_path, &events_path]);
}

/// Every status path and old path of a rename under one of `prefixes`.
///
/// Implements: rust-retry/archived-retry
fn paths(status: &[StatusEntry], prefixes: &[&str]) -> Vec<String> {
    let mut selected = BTreeSet::new();
    for entry in status {
        let candidates = std::iter::once(&entry.path).chain(entry.from.iter());
        for candidate in candidates {
            if prefixes.iter().any(|prefix| under(candidate, prefix)) {
                selected.insert(candidate.clone());
            }
        }
    }
    selected.into_iter().collect()
}

/// Whether `candidate` equals `prefix` or lies under it.
///
/// Implements: rust-retry/archived-retry
fn under(candidate: &str, prefix: &str) -> bool {
    let mut parts = candidate.split('/');
    prefix.split('/').all(|part| parts.next() == Some(part))
}

/// The archive commit message for one archived change.
///
/// Implements: rust-retry/archived-retry
fn message(id: &str, title: Option<&str>, archive_path: &str, folder: &str) -> String {
    format!(
        "osq: {id} archived\n\n{}\narchived to {archive_path}\n\nOsq-Change: {folder}\n",
        title.unwrap_or_default()
    )
}

/// A path relative to `root`, with every component joined by `/`.
///
/// Implements: rust-retry/archived-retry
pub(crate) fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// The failure for an archive commit or one of its steps.
///
/// Implements: rust-retry/archived-retry
fn failed(error: &VcsError) -> FeatureError {
    text::failed(format!(
        "osq could not commit the archive: {}",
        vcs_detail::detail(error)
    ))
}

/// The failure for a record file that cannot be written.
///
/// Implements: rust-retry/archived-retry
fn write_failed(path: &Path, error: &impl fmt::Display) -> FeatureError {
    text::failed(format!("cannot write {}: {error}", path.display()))
}
