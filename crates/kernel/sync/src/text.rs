//! The messages and path rules "Land sync" names.

use std::path::Path;

use osq_core::event::SyncStopReason;

use super::stop::Stop;

/// The folder's text before its first dash, or the whole name.
///
/// Implements: rust-land/land-commit
pub(crate) fn change_id(folder: &str) -> &str {
    folder.split_once('-').map_or(folder, |(id, _)| id)
}

/// Whether a conflicting path a living spec or an archived folder owns.
///
/// Implements: rust-land/land-sync
pub(crate) fn resolvable(path: &str) -> bool {
    is_under("openspec/specs", path)
        || is_under("openspec/changes/archive", path)
        || is_lockfile(path)
}

/// Whether `path` is `prefix` itself or sits under it.
///
/// Implements: rust-land/land-sync
pub(crate) fn is_under(prefix: &str, path: &str) -> bool {
    path == prefix
        || path
            .strip_prefix(prefix)
            .is_some_and(|rest| rest.starts_with('/'))
}

/// Whether a path's file name is `Cargo.lock`.
///
/// Implements: rust-land/land-sync
pub(crate) fn is_lockfile(path: &str) -> bool {
    Path::new(path)
        .file_name()
        .is_some_and(|name| name == "Cargo.lock")
}

/// The stop for the conflicts a code path makes, unless none is blocked.
///
/// Implements: rust-land/land-sync
pub(crate) fn conflict_stop(
    folder: &str,
    default_branch: &str,
    conflicts: &[String],
) -> Option<Stop> {
    let blocked: Vec<&str> = conflicts
        .iter()
        .filter(|path| !resolvable(path))
        .map(String::as_str)
        .collect();
    if blocked.is_empty() {
        return None;
    }
    let id = change_id(folder);
    let message = format!(
        "{folder}: {} conflict with {default_branch}; run osq plan {id}, and approving the revised plan restarts osq/{folder} from {default_branch}",
        blocked.join(", ")
    );
    Some(Stop::conflicting(
        SyncStopReason::SyncConflict,
        message,
        blocked.iter().map(|path| (*path).to_owned()).collect(),
    ))
}

/// The message for requirements the default branch changed under the change.
///
/// Implements: rust-land/land-sync
pub(crate) fn requirements_changed(
    folder: &str,
    default_branch: &str,
    changed: &[(String, String)],
) -> String {
    let id = change_id(folder);
    let pairs = changed
        .iter()
        .map(|(capability, requirement)| format!("{capability}: {requirement}"))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        "{folder}: {default_branch} changed requirements this change rewrites since it was approved: {pairs}; run osq plan {id} to revise the plan against {default_branch}"
    )
}

/// The sync commit message.
///
/// Implements: rust-land/land-sync
pub(crate) fn sync_message(folder: &str, default_branch: &str) -> String {
    format!(
        "osq: {} sync {default_branch}\n\nOsq-Change: {folder}",
        change_id(folder)
    )
}

/// The prefix of a failed lock file rebuild.
///
/// Implements: rust-land/land-sync
pub(crate) fn rebuild_failed(folder: &str, lockfile: &str, default_branch: &str) -> String {
    format!("{folder}: rebuilding {lockfile} failed on osq/{folder} merged with {default_branch}:")
}

/// The last `max_lines` lines after dropping trailing blank lines.
///
/// Implements: rust-land/land-sync
pub(crate) fn output_tail(output: &str, max_lines: usize) -> String {
    let mut lines: Vec<&str> = output.lines().collect();
    while lines.last().is_some_and(|line| line.trim().is_empty()) {
        lines.pop();
    }
    let start = lines.len().saturating_sub(max_lines);
    lines[start..].join("\n")
}
