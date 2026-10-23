//! The failure and output texts `land` prints.

use std::fmt::Write;

/// The refusal when `vcs` or git is unavailable.
pub(crate) const NEEDS_GIT: &str = "osq land needs vcs.enabled and git";
/// The refusal `sync` makes when `vcs` or git is unavailable.
pub(crate) const SYNC_NEEDS_GIT: &str = "osq sync needs vcs.enabled and git";
/// The refusal `message` makes when `vcs` or git is unavailable.
pub(crate) const MESSAGE_NEEDS_GIT: &str = "osq message needs vcs.enabled and git";
/// The default branch when `vcs.defaultBranch` is unset.
pub(crate) const DEFAULT_BRANCH: &str = "main";

/// The folder's text before its first dash, or the whole name.
///
/// Implements: rust-land/land-commit
pub(crate) fn change_id(folder: &str) -> &str {
    folder.split_once('-').map_or(folder, |(id, _)| id)
}

/// The two lines for a change whose archive the default branch already holds.
///
/// Implements: rust-land/land-lookup
pub(crate) fn landed_nothing(folder: &str) -> String {
    format!("{folder} has already landed; nothing to clean up\n")
}

/// The line for a landed change whose worktree still exists.
///
/// Implements: rust-land/land-lookup
pub(crate) fn landed_worktree(folder: &str) -> String {
    format!("{folder} has already landed; Rust land does not remove worktrees yet\n")
}

/// The refusal for a worktree change that has not archived.
///
/// Implements: rust-land/land-lookup
pub(crate) fn not_archived(folder: &str) -> String {
    format!("{folder} has not archived on osq/{folder}")
}

/// The refusal when no osq worktree holds an archived change for `query`.
///
/// Implements: rust-land/land-lookup
pub(crate) fn no_archived(query: &str) -> String {
    format!("No archived change \"{query}\" in an osq worktree")
}

/// The sync's refusal for a worktree change that has not archived.
///
/// Implements: rust-land/sync-command
pub(crate) fn sync_not_archived(folder: &str) -> String {
    format!("{folder} has not archived; Rust sync does not sync an active change yet")
}

/// The sync's refusal when no osq worktree change matches `query`.
///
/// Implements: rust-land/sync-command
pub(crate) fn no_change(query: &str) -> String {
    format!("No change \"{query}\" runs in an osq worktree")
}

/// The sync's line after it commits the default branch into the branch.
///
/// Implements: rust-land/sync-command
pub(crate) fn synced(folder: &str, default_branch: &str) -> String {
    format!("Synced osq/{folder} with {default_branch}\n")
}

/// The sync's line when the branch already holds the default branch.
///
/// Implements: rust-land/sync-command
pub(crate) fn already_has(folder: &str, default_branch: &str) -> String {
    format!("osq/{folder} already has {default_branch}\n")
}

/// The refusal when the default branch moved under the land.
///
/// Implements: rust-land/land-commit
pub(crate) fn moved(default_branch: &str, id: &str) -> String {
    format!("{default_branch} moved while landing; run osq land {id} again")
}

/// The refusal when uncommitted files stand where the land writes.
///
/// Implements: rust-land/land-commit
pub(crate) fn blocked(paths: &[String], block: bool, id: &str) -> String {
    let advice = if block {
        "commit or stash them"
    } else {
        "keep them with osq manual \"<why>\", or commit or stash them"
    };
    format!(
        "The checkout has uncommitted changes in files this land writes: {}; {advice}, then run osq land {id} again",
        paths.join(", ")
    )
}

/// The success lines and one `Changed` line per path.
///
/// Implements: rust-land/land-commit
pub(crate) fn landed(
    folder: &str,
    commit: &str,
    root: &std::path::Path,
    changed: &[String],
) -> String {
    let mut lines = format!("Landed {folder} as {commit}\nKept branch osq/{folder}\n");
    for path in changed {
        writeln!(lines, "Changed {}", root.join(path).display()).expect("a string writes");
    }
    lines
}
