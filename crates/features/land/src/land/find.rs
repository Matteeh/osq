//! Matching a query against worktree change folders.

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

/// Whether a folder name matches a query as TypeScript's `matchesFolder` does.
///
/// Implements: rust-land/land-lookup
pub(crate) fn matches_folder(folder: &str, query: &str) -> bool {
    let trimmed = query.trim();
    let padded = padded(trimmed);
    matches_prefix(folder, trimmed) || matches_prefix(folder, &padded)
}

/// Whether `folder` equals `prefix` or starts with it followed by a dash.
///
/// Implements: rust-land/land-lookup
fn matches_prefix(folder: &str, prefix: &str) -> bool {
    folder == prefix || starts_with_dash(folder, prefix)
}

/// The leading digits of `text` padded to three digits, or `text` without any.
///
/// Implements: rust-land/land-lookup
fn padded(text: &str) -> String {
    let digits: String = text.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        return text.to_owned();
    }
    let value = digits.trim_start_matches('0');
    if value.is_empty() {
        return "000".to_owned();
    }
    format!("{value:0>3}")
}

/// Whether `folder` starts with `prefix` followed by a dash.
///
/// Implements: rust-land/land-lookup
fn starts_with_dash(folder: &str, prefix: &str) -> bool {
    folder
        .strip_prefix(prefix)
        .is_some_and(|rest| rest.starts_with('-'))
}
