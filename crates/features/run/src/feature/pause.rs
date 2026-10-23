//! Writing TypeScript's `.run/paused.md` for a usage-limit pause.

use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_runners::UsagePause;
use osq_kernel_vcs::{GitVcs, Vcs};

/// The body a pause holds when its limit gave no error.
const DEFAULT_BODY: &str = "usage limit reached";

/// Builds `.run/paused.md`'s bytes for `pause`.
///
/// Implements: rust-run/run-usage-pause
pub(crate) fn content(pause: &UsagePause) -> String {
    let body = pause.error.as_deref().unwrap_or(DEFAULT_BODY);
    format!(
        "---\ntask: \"{}\"\nuntil: \"{}\"\nsource: \"{}\"\n---\n{body}\n",
        pause.task,
        pause.until,
        pause.source.as_str()
    )
}

/// Writes the change folder's `.run/paused.md`, creating `.run/` when needed.
///
/// # Errors
///
/// Returns a `Failed` error with the command `run` when the `.run` folder or
/// the pause file cannot be created or written.
///
/// Implements: rust-run/run-usage-pause
pub(crate) fn write(folder: &Path, pause: &UsagePause) -> Result<(), FeatureError> {
    let dir = folder.join(".run");
    fs::create_dir_all(&dir).map_err(|error| failed(&dir, &error))?;
    let path = dir.join("paused.md");
    fs::write(&path, content(pause)).map_err(|error| failed(&path, &error))
}

/// Discards the executor's files outside the change folder in an osq
/// worktree, and nothing when there is none.
///
/// # Errors
///
/// Returns a `Failed` error with git status's or discard's display.
///
/// Implements: rust-run/paused-worktree-discard
pub(crate) fn discard_worktree(
    root: &Path,
    folder: &Path,
    config: &Config,
) -> Result<(), FeatureError> {
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let status = vcs.status().map_err(|error| failed_git(&error))?;
    let outside = outside_change(root, folder, &status);
    if outside.is_empty() {
        return Ok(());
    }
    let paths: Vec<&str> = outside.iter().map(String::as_str).collect();
    vcs.discard(&paths).map_err(|error| failed_git(&error))
}

/// Every status path outside the change folder, a rename's source included.
///
/// Implements: rust-run/dead-task-commit
/// Implements: rust-run/paused-worktree-discard
pub(crate) fn outside_change(
    root: &Path,
    folder: &Path,
    status: &[osq_kernel_vcs::StatusEntry],
) -> Vec<String> {
    let change = folder
        .strip_prefix(root)
        .map_or_else(|_| folder.to_path_buf(), Path::to_path_buf)
        .to_string_lossy()
        .replace('\\', "/");
    if change.is_empty() || change == "." {
        return Vec::new();
    }
    let mut paths = Vec::new();
    for item in status {
        for candidate in std::iter::once(&item.path).chain(item.from.iter()) {
            let inside = candidate == &change
                || candidate
                    .strip_prefix(&change)
                    .is_some_and(|rest| rest.starts_with('/'));
            if inside || paths.contains(candidate) {
                continue;
            }
            paths.push(candidate.clone());
        }
    }
    paths
}

/// Builds the failed error for a pause path that could not be written.
fn failed(path: &Path, error: &std::io::Error) -> FeatureError {
    FeatureError::failed("run", format!("cannot write {}: {error}", path.display()))
}

/// Builds the failed error with git's display.
fn failed_git(error: &osq_kernel_vcs::VcsError) -> FeatureError {
    FeatureError::failed("run", error.to_string())
}
