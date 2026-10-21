//! Each merge write's git arguments, its NUL path split and its blocked rule.

use crate::port::{FastForward, MergeOutcome, StatusEntry};
use crate::{Vcs, VcsError};

use super::GitVcs;

/// The non-empty paths of NUL-separated `-z` output, in git's order.
fn split_paths(output: &str) -> Vec<String> {
    output
        .split('\0')
        .filter(|path| !path.is_empty())
        .map(str::to_owned)
        .collect()
}

/// Sorts `paths` and drops repeated ones.
fn sorted(mut paths: Vec<String>) -> Vec<String> {
    paths.sort();
    paths.dedup();
    paths
}

/// The arguments that merge `rev`, squashed or not.
fn merge_args(rev: &str, squash: bool) -> Vec<&str> {
    if squash {
        vec!["merge", "--squash", rev]
    } else {
        vec!["merge", "--no-ff", "--no-commit", rev]
    }
}

/// The status paths and old paths that `changed` would overwrite, sorted.
fn blocked_paths(status: &[StatusEntry], changed: &[String]) -> Vec<String> {
    let mut paths = Vec::new();
    for entry in status {
        paths.push(entry.path.clone());
        if let Some(from) = &entry.from {
            paths.push(from.clone());
        }
    }
    paths.retain(|path| changed.contains(path));
    sorted(paths)
}

/// Merges `rev`, squashed or not.
pub(super) fn merge(vcs: &GitVcs, rev: &str, squash: bool) -> Result<MergeOutcome, VcsError> {
    let args = merge_args(rev, squash);
    match vcs.write(&args, &[], None) {
        Ok(_) => Ok(MergeOutcome::Clean),
        Err(refusal @ VcsError::Failed { .. }) => {
            let unmerged = vcs.read(&["diff", "--name-only", "--diff-filter=U", "-z"])?;
            let paths = sorted(unmerged.as_deref().map(split_paths).unwrap_or_default());
            if paths.is_empty() {
                return Err(refusal);
            }
            Ok(MergeOutcome::Conflict { paths })
        }
        Err(error) => Err(error),
    }
}

/// Aborts the merge in progress.
pub(super) fn merge_abort(vcs: &GitVcs) -> Result<(), VcsError> {
    vcs.write(&["merge", "--abort"], &[], None).map(|_| ())
}

/// Fast-forwards to `commit`, unless an uncommitted path it changes blocks it.
pub(super) fn fast_forward(vcs: &GitVcs, commit: &str) -> Result<FastForward, VcsError> {
    let status = vcs.status()?;
    let diff = vcs.read(&["diff", "--name-only", "-z", "HEAD", commit])?;
    let changed = sorted(diff.as_deref().map(split_paths).unwrap_or_default());
    let blocked = blocked_paths(&status, &changed);
    if !blocked.is_empty() {
        return Ok(FastForward::Blocked { paths: blocked });
    }
    vcs.write(&["merge", "--ff-only", commit], &[], None)?;
    Ok(FastForward::Done { changed })
}
