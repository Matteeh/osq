//! Refusing a worktree retry while its plan holds edits its last commit lacks.

use std::collections::BTreeSet;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_vcs::{GitVcs, Vcs};

use super::archive_commit::relative;
use super::{args, text};

/// The only uncommitted plan file a retry tolerates besides the folder's `.run`.
const TASKS_FILE: &str = "tasks.md";

/// Refuses a worktree change whose plan edits are not committed, naming them.
///
/// # Errors
///
/// Returns a `Failed` error with the command `retry` with the `VcsError`'s
/// display when git status cannot be read, or with the refusal when a plan
/// edit is uncommitted.
///
/// Implements: rust-retry/plan-edits-refusal
pub(crate) fn check(
    tree_root: &Path,
    folder: &Path,
    folder_name: &str,
    config: &Config,
) -> Result<(), FeatureError> {
    let vcs = GitVcs::new(tree_root).with_timeouts(&config.timeouts);
    let status = vcs
        .status()
        .map_err(|error| text::failed(error.to_string()))?;
    let change = relative(tree_root, folder);
    let edits = edits(&status, &change);
    if edits.is_empty() {
        return Ok(());
    }
    Err(text::plan_edits(
        args::id(folder_name),
        &edits.into_iter().collect::<Vec<_>>().join(", "),
    ))
}

/// Every plan edit inside `change`, relative to it and sorted by bytes.
///
/// Implements: rust-retry/plan-edits-refusal
fn edits(status: &[osq_kernel_vcs::StatusEntry], change: &str) -> BTreeSet<String> {
    let prefix = format!("{change}/");
    let run_prefix = format!("{change}/.run/");
    let tasks = format!("{change}/{TASKS_FILE}");
    let mut edits = BTreeSet::new();
    for entry in status {
        let candidates = std::iter::once(&entry.path).chain(entry.from.iter());
        for candidate in candidates {
            if *candidate == tasks || candidate.starts_with(&run_prefix) {
                continue;
            }
            if let Some(edit) = candidate.strip_prefix(&prefix) {
                edits.insert(edit.to_owned());
            }
        }
    }
    edits
}
