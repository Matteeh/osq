//! Matching a query against worktree change folders.

use osq_core::parse_change_id;

/// One osq worktree and the change folder its branch names.
#[derive(Clone, Debug)]
pub(crate) struct WorktreeChange {
    /// The change folder.
    pub(crate) folder: String,
    /// The worktree's path.
    pub(crate) path: std::path::PathBuf,
    /// The worktree's trimmed HEAD, when it has one.
    pub(crate) head: Option<String>,
    /// Whether the worktree holds `openspec/changes/<folder>`.
    pub(crate) active: bool,
    /// Whether the worktree holds `openspec/changes/archive/<folder>`.
    pub(crate) archived: bool,
}

/// The change a lookup found and whether the default branch already holds it.
#[derive(Clone, Debug)]
pub(crate) struct Located {
    /// The change's folder name.
    pub(crate) folder: String,
    /// The worktree holding an archived folder, when one does.
    pub(crate) worktree: Option<WorktreeChange>,
    /// Whether the default branch holds the archived folder.
    pub(crate) landed: bool,
}

/// The first matching worktree change that holds an archived folder.
///
/// Implements: rust-land/land-lookup
pub(crate) fn archived_change<'a>(
    changes: &'a [WorktreeChange],
    query: &str,
) -> Option<&'a WorktreeChange> {
    changes
        .iter()
        .find(|change| change.archived && matches_folder(&change.folder, query))
}

/// The first matching worktree change that still holds an active folder.
///
/// Implements: rust-land/land-lookup
pub(crate) fn active_change<'a>(
    changes: &'a [WorktreeChange],
    query: &str,
) -> Option<&'a WorktreeChange> {
    changes
        .iter()
        .find(|change| change.active && matches_folder(&change.folder, query))
}

/// The first matching active worktree change whose folder holds an approval.
///
/// Implements: rust-land/sync-command
pub(crate) fn approved_change<'a>(
    changes: &'a [WorktreeChange],
    query: &str,
) -> Option<&'a WorktreeChange> {
    changes.iter().find(|change| {
        change.active
            && matches_folder(&change.folder, query)
            && change
                .path
                .join("openspec")
                .join("changes")
                .join(&change.folder)
                .join(".run")
                .join("approved")
                .symlink_metadata()
                .is_ok()
    })
}

/// Whether a folder name matches a query that core reads as a change id.
///
/// Implements: rust-land/land-lookup
pub(crate) fn matches_folder(folder: &str, query: &str) -> bool {
    parse_change_id(query, false).is_ok_and(|id| id.names(folder))
}
