//! Finishing a worktree rejection: commit the move, then remove the worktree.

use std::path::{Path, PathBuf};

use osq_kernel_config::Config;
use osq_kernel_vcs::{GitVcs, StatusEntry, Vcs};

/// What finishing a worktree rejection did to the tree and its branch.
pub(crate) struct Outcome {
    /// The tree as git's root gives it, or the tree's own root.
    pub(crate) tree: PathBuf,
    /// Whether the worktree was removed.
    pub(crate) removed: bool,
    /// Why the worktree was kept, absent when it was removed.
    pub(crate) why: Option<String>,
}

/// Commits a rejected change's move in its worktree and removes the worktree
/// when no other change remains.
///
/// Implements: rust-approve/worktree-rejection
pub(crate) fn finish(
    tree: &Path,
    config: &Config,
    id: &str,
    source: &Path,
    destination: &Path,
    reason: &str,
) -> Outcome {
    let vcs = GitVcs::new(tree).with_timeouts(&config.timeouts);
    let root = match vcs.root() {
        Ok(found) => found.unwrap_or_else(|| tree.to_path_buf()),
        Err(error) => return kept(tree, error.to_string()),
    };
    let prefixes = [relative(&root, source), relative(&root, destination)];
    let status = match vcs.status() {
        Ok(status) => status,
        Err(error) => return kept(&root, error.to_string()),
    };
    let selected = paths(&status, &prefixes);
    let refs: Vec<&str> = selected.iter().map(String::as_str).collect();
    let folder = destination
        .file_name()
        .map_or_else(String::new, |name| name.to_string_lossy().into_owned());
    let message = message(id, reason, &prefixes[1], &folder);
    let author = config.vcs.author.as_deref().unwrap_or_default();
    if let Err(error) = vcs.commit(&refs, &message, author) {
        return kept(&root, error.to_string());
    }
    match vcs.status() {
        Ok(status) if has_other_changes(&status, &prefixes) => {
            return kept(&root, OTHER_CHANGES.to_owned());
        }
        Ok(_) => {}
        Err(error) => return kept(&root, error.to_string()),
    }
    match vcs.worktree_remove(&root.to_string_lossy()) {
        Ok(()) => Outcome {
            tree: root,
            removed: true,
            why: None,
        },
        Err(error) => kept(&root, error.to_string()),
    }
}

/// The reason a rejection keeps a worktree that still has other changes.
const OTHER_CHANGES: &str = "the worktree has other changes";

/// An outcome that keeps the worktree at `tree` for `why`.
///
/// Implements: rust-approve/worktree-rejection
fn kept(tree: &Path, why: String) -> Outcome {
    Outcome {
        tree: tree.to_path_buf(),
        removed: false,
        why: Some(why),
    }
}

/// Every status path and old path that equals or lies under one of `prefixes`,
/// sorted and without repeats.
///
/// Implements: rust-approve/worktree-rejection
fn paths(status: &[StatusEntry], prefixes: &[String]) -> Vec<String> {
    let mut selected = std::collections::BTreeSet::new();
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

/// Whether status lists anything outside the two rejected folders.
///
/// Implements: rust-approve/worktree-rejection
fn has_other_changes(status: &[StatusEntry], prefixes: &[String]) -> bool {
    status.iter().any(|entry| {
        std::iter::once(&entry.path)
            .chain(entry.from.iter())
            .any(|candidate| !prefixes.iter().any(|prefix| under(candidate, prefix)))
    })
}

/// Whether `candidate` equals `prefix` or lies under it.
///
/// Implements: rust-approve/worktree-rejection
fn under(candidate: &str, prefix: &str) -> bool {
    let mut parts = candidate.split('/');
    prefix.split('/').all(|part| parts.next() == Some(part))
}

/// The commit message for one rejected worktree change.
///
/// Implements: rust-approve/worktree-rejection
fn message(id: &str, reason: &str, rejected: &str, folder: &str) -> String {
    format!("osq: {id} rejected\n\n{reason}\nrejected to {rejected}\n\nOsq-Change: {folder}\n")
}

/// A path relative to `root`, with every component joined by `/`.
///
/// Implements: rust-approve/worktree-rejection
fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}
