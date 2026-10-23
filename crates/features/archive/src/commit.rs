//! Committing an archived worktree change as TypeScript's archive commit does.

use std::collections::BTreeSet;
use std::fmt;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_vcs::{GitVcs, StatusEntry, Vcs, VcsError};

use crate::{excerpt, regress};

/// The archive folder under a tree's `openspec/changes/`.
const ARCHIVE: &str = "openspec/changes/archive";

/// The living specs folder under a tree's root.
const SPECS: &str = "openspec/specs";

/// A failed archive commit: the command's error and, when git refused the
/// commit, the detail its record keeps.
///
/// Implements: rust-archive/worktree-archive
pub(crate) struct Failure {
    /// The `Failed` error the archive returns.
    pub(crate) error: FeatureError,
    /// The detail to record, or none when status failed before the commit.
    pub(crate) detail: Option<String>,
}

/// Commits the archive move in `tree_root`.
///
/// # Errors
///
/// Returns a `Failure` naming the `archive` command when git status or the
/// commit fails, with the commit's detail when there is one to record.
///
/// Implements: rust-archive/worktree-archive
pub(crate) fn run(
    tree_root: &Path,
    config: &Config,
    change: &Path,
    folder: &str,
    title: Option<&str>,
    archive_path: &str,
) -> Result<(), Failure> {
    let vcs = GitVcs::new(tree_root).with_timeouts(&config.timeouts);
    let status = vcs
        .status()
        .map_err(|error| Failure::plain(folder, &error))?;
    let old = relative(tree_root, change);
    let selected = paths(&status, &[&old, ARCHIVE, SPECS]);
    let refs: Vec<&str> = selected.iter().map(String::as_str).collect();
    let author = config.vcs.author.as_deref().unwrap_or_default();
    let message = message(&id(folder), title, archive_path, folder);
    vcs.commit(&refs, &message, author)
        .map(|_| ())
        .map_err(|error| Failure::recorded(folder, &error, config))
}

impl Failure {
    /// A failure before the commit, which records nothing.
    ///
    /// Implements: rust-archive/worktree-archive
    fn plain(folder: &str, error: &VcsError) -> Self {
        Self {
            error: failed(folder, error),
            detail: None,
        }
    }

    /// A failed commit, with its tail-cut detail to record.
    ///
    /// Implements: rust-archive/worktree-archive
    fn recorded(folder: &str, error: &VcsError, config: &Config) -> Self {
        let detail = excerpt::tail_verify_output(
            &regress::detail(error),
            config.limits.marker_output_lines,
            config.limits.marker_line_chars,
        );
        Self {
            error: failed(folder, error),
            detail: Some(detail),
        }
    }
}

/// The failure for an archive commit git refused.
///
/// Implements: rust-archive/worktree-archive
fn failed(folder: &str, error: impl fmt::Display) -> FeatureError {
    FeatureError::failed(
        "archive",
        format!("osq could not commit the archive of {folder}: {error}"),
    )
}

/// Every status path and old path of a rename under one of `prefixes`.
///
/// Implements: rust-archive/worktree-archive
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
/// Implements: rust-archive/worktree-archive
fn under(candidate: &str, prefix: &str) -> bool {
    let mut parts = candidate.split('/');
    prefix.split('/').all(|part| parts.next() == Some(part))
}

/// The commit message for one archived change.
///
/// Implements: rust-archive/worktree-archive
fn message(id: &str, title: Option<&str>, archive_path: &str, folder: &str) -> String {
    format!(
        "osq: {id} archived\n\n{}\narchived to {archive_path}\n\nOsq-Change: {folder}\n",
        title.unwrap_or_default()
    )
}

/// The change folder's leading digits, or its whole name without any.
///
/// Implements: rust-archive/worktree-archive
fn id(folder: &str) -> String {
    let digits: String = folder.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        folder.to_owned()
    } else {
        digits
    }
}

/// A path relative to `root`, with every component joined by `/`.
///
/// Implements: rust-archive/worktree-archive
fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}
