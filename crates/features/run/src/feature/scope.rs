//! The before/after git snapshots and the task's scope audit.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_core::event::DeadReason;
use osq_core::scope::audit_scope;
use osq_core::scope::{ChangedPath, DisallowReason, Disallowed, LockRule, PathChange, ScopeAudit};
use osq_kernel_specs::TaskFile;
use osq_kernel_storage::ChangeEntry;
use osq_kernel_vcs::{GitVcs, StatusEntry, Vcs};
use sha2::{Digest, Sha256};

use super::{dead, events};

/// One status entry's code and the hash of the file's bytes, or none when missing.
type Snapshot = BTreeMap<String, (String, Option<String>)>;

/// Reads git status and hashes every listed file.
///
/// # Errors
///
/// Returns a `Failed` error when git status cannot be read.
///
/// Implements: rust-run/run-scope-audit
pub(crate) fn snapshot(root: &Path) -> Result<Snapshot, FeatureError> {
    let entries = GitVcs::new(root)
        .status()
        .map_err(|error| failed(error.to_string()))?;
    let mut snapshot = BTreeMap::new();
    for entry in entries {
        snapshot.insert(entry.path.clone(), state_of(root, &entry));
    }
    Ok(snapshot)
}

/// Reads one status entry's code and file hash.
fn state_of(root: &Path, entry: &StatusEntry) -> (String, Option<String>) {
    let path = root.join(&entry.path);
    let hash = fs::read(path).ok().map(|bytes| digest(&bytes));
    (entry.code.clone(), hash)
}

/// Hashes one file's bytes with SHA-256, as lowercase hex.
fn digest(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    let digest = Sha256::digest(bytes);
    digest
        .iter()
        .fold(String::with_capacity(64), |mut hex, byte| {
            write!(hex, "{byte:02x}").expect("writing to a String succeeds");
            hex
        })
}

/// Gives every path whose status code or file hash changed.
///
/// Implements: rust-run/run-scope-audit
#[must_use]
pub(crate) fn changed(before: &Snapshot, after: &Snapshot) -> Vec<ChangedPath> {
    let paths: BTreeSet<&String> = before.keys().chain(after.keys()).collect();
    paths
        .into_iter()
        .filter_map(|path| {
            let old = before.get(path);
            let new = after.get(path);
            if old == new {
                return None;
            }
            Some(ChangedPath {
                path: path.clone(),
                change: change_of(old, new),
            })
        })
        .collect()
}

/// Classifies one changed path as added, deleted or modified.
fn change_of(
    old: Option<&(String, Option<String>)>,
    new: Option<&(String, Option<String>)>,
) -> PathChange {
    match (old, new) {
        (_, None | Some((_, None))) => PathChange::Deleted,
        (None, Some((code, _))) if code == "??" || code.starts_with('A') => PathChange::Added,
        _ => PathChange::Modified,
    }
}

/// Audits the changed paths and kills the task on a violation.
///
/// # Errors
///
/// Returns a `Failed` error after recording a dead marker and event when a path
/// is outside the scope or a frozen test changed.
///
/// Implements: rust-run/run-scope-audit
pub(crate) fn audit(
    root: &Path,
    entry: &ChangeEntry,
    task: &str,
    task_file: &TaskFile,
    changes: Vec<ChangedPath>,
) -> Result<(), FeatureError> {
    let audit = ScopeAudit {
        scope: task_file.scope.clone(),
        tests_modify: task_file.tests_modify,
        change_folder: relative(root, &entry.path),
        test_folders: test_folders(root, &changes),
        lock_rules: lock_rules(),
        changes,
    };
    let disallowed = audit_scope(&audit);
    let outside = outside_files(&disallowed);
    if !outside.is_empty() {
        events::scope_violation(&entry.path, task, outside.clone())?;
        let marker = format!(
            "---\nreason: scope_violation\n---\n{}\n",
            outside.join("\n")
        );
        return dead::kill(
            &entry.path,
            &entry.folder,
            task,
            DeadReason::ScopeViolation,
            &marker,
        );
    }
    if disallowed.is_empty() {
        return Ok(());
    }
    let list: Vec<String> = disallowed
        .iter()
        .map(|item| {
            let label = if item.reason == DisallowReason::FrozenTestDeleted {
                "deleted"
            } else {
                "modified"
            };
            format!("- {} ({label})", item.path)
        })
        .collect();
    let marker = format!(
        "---\nreason: undeclared_test_change\n---\nPreexisting test files were modified or deleted without both tests.modify: true and an authorizing scope entry:\n{}\n",
        list.join("\n")
    );
    dead::kill(
        &entry.path,
        &entry.folder,
        task,
        DeadReason::UndeclaredTestChange,
        &marker,
    )
}

/// The sorted paths whose reason is outside the task's scope.
fn outside_files(disallowed: &[Disallowed]) -> Vec<String> {
    disallowed
        .iter()
        .filter(|item| item.reason == DisallowReason::OutsideScope)
        .map(|item| item.path.clone())
        .collect()
}

/// The `tests` and `benches` folders beside each changed path's nearest manifest.
fn test_folders(root: &Path, changes: &[ChangedPath]) -> Vec<String> {
    let mut folders = BTreeSet::new();
    for changed in changes {
        if let Some(manifest) = nearest_manifest(root, &changed.path) {
            folders.insert(join(&manifest, "tests"));
            folders.insert(join(&manifest, "benches"));
        }
    }
    folders.into_iter().collect()
}

/// The nearest folder above a path that holds a `Cargo.toml`.
fn nearest_manifest(root: &Path, path: &str) -> Option<String> {
    let mut folder = Path::new(path).parent();
    while let Some(current) = folder {
        if root.join(current).join("Cargo.toml").is_file() {
            return Some(relative(root, &root.join(current)));
        }
        folder = current.parent();
    }
    None
}

/// Joins two relative POSIX path parts.
fn join(folder: &str, name: &str) -> String {
    if folder.is_empty() {
        name.to_owned()
    } else {
        format!("{folder}/{name}")
    }
}

/// Gives one path relative to the root as a POSIX path.
fn relative(root: &Path, path: &Path) -> String {
    let relative: PathBuf = path
        .strip_prefix(root)
        .map_or_else(|_| path.to_path_buf(), Path::to_path_buf);
    relative.to_string_lossy().replace('\\', "/")
}

/// The lock rules Rust and TypeScript use.
fn lock_rules() -> Vec<LockRule> {
    vec![
        LockRule {
            manifests: vec!["Cargo.toml".to_owned()],
            lock_files: vec!["Cargo.lock".to_owned()],
        },
        LockRule {
            manifests: vec!["package.json".to_owned()],
            lock_files: vec![
                "package-lock.json".to_owned(),
                "pnpm-lock.yaml".to_owned(),
                "yarn.lock".to_owned(),
            ],
        },
    ]
}

/// Builds the failed error for a snapshot that could not be read.
fn failed(message: String) -> FeatureError {
    FeatureError::failed("run", message)
}
