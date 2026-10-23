//! The worktree checks a run makes before its marker refusals.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_core::event::RegressionReason;
use osq_kernel_config::Config;
use osq_kernel_specs::{parse_frontmatter, read_task_file};
use osq_kernel_storage::ChangeEntry;
use osq_kernel_vcs::{GitVcs, StatusEntry, Vcs};

use super::{commit, halt, scope};

/// The detail an off-branch halt gives a repository with no current branch.
const DETACHED_HEAD: &str = "detached HEAD";

/// Commits the pending verified tasks, then halts the change when its branch or
/// its status is wrong.
///
/// # Errors
///
/// Returns the failed ending of a refused pending commit, or a `Failed` error
/// after recording an `worktree_off_branch` or `worktree_dirty` halt.
///
/// Implements: rust-run/worktree-checks
pub(crate) fn run(root: &Path, entry: &ChangeEntry, config: &Config) -> Result<(), FeatureError> {
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    commit_pending(&vcs, root, entry, config)?;
    let head = vcs.head().map_err(|error| failed(error.to_string()))?;
    let expected = format!("osq/{}", entry.folder);
    if head.branch.as_deref() != Some(expected.as_str()) {
        let detail = head.branch.as_deref().unwrap_or(DETACHED_HEAD);
        halt::record(
            &entry.path,
            RegressionReason::WorktreeOffBranch,
            detail,
            config,
        )?;
        return Err(halt::failure(
            &entry.folder,
            RegressionReason::WorktreeOffBranch,
        ));
    }
    let status = vcs.status().map_err(|error| failed(error.to_string()))?;
    let change = scope::relative(root, &entry.path);
    let dirt = dirt(&status, &change);
    if !dirt.is_empty() {
        halt::record(
            &entry.path,
            RegressionReason::WorktreeDirty,
            &dirt.join("\n"),
            config,
        )?;
        return Err(halt::failure(
            &entry.folder,
            RegressionReason::WorktreeDirty,
        ));
    }
    Ok(())
}

/// Commits every pending done marker that is not a human `manual: true` one.
///
/// # Errors
///
/// Returns a `Failed` error when status, a task file or a commit cannot be read
/// or made.
///
/// Implements: rust-run/worktree-checks
fn commit_pending(
    vcs: &GitVcs,
    root: &Path,
    entry: &ChangeEntry,
    config: &Config,
) -> Result<(), FeatureError> {
    let status = vcs.status().map_err(|error| failed(error.to_string()))?;
    let change = scope::relative(root, &entry.path);
    for task in pending_done(&status, &change) {
        let marker = entry.path.join(".run").join("done").join(&task);
        let text = fs::read_to_string(marker).unwrap_or_default();
        if manual(&text) {
            continue;
        }
        let path = entry.path.join("tasks").join(format!("{task}.md"));
        let task_file = read_task_file(&path).map_err(|error| failed(error.to_string()))?;
        commit::verified(root, entry, &task, &task_file, config)?;
    }
    Ok(())
}

/// The done marker tasks status lists as untracked or added, in task order.
///
/// Implements: rust-run/worktree-checks
fn pending_done(status: &[StatusEntry], change: &str) -> Vec<String> {
    let prefix = format!("{change}/.run/done/");
    let mut tasks = BTreeSet::new();
    for entry in status {
        if entry.code != "??" && !entry.code.starts_with('A') {
            continue;
        }
        let Some(task) = entry.path.strip_prefix(&prefix) else {
            continue;
        };
        if !task.is_empty() && task.chars().all(|character| character.is_ascii_digit()) {
            tasks.insert(task.to_owned());
        }
    }
    let mut tasks: Vec<String> = tasks.into_iter().collect();
    tasks.sort_by_key(|task| number(task));
    tasks
}

/// A task marker's number, or the largest one when it cannot be parsed.
fn number(task: &str) -> u128 {
    task.parse().unwrap_or(u128::MAX)
}

/// Whether a done marker's frontmatter holds `manual: true`.
fn manual(text: &str) -> bool {
    parse_frontmatter(text).is_ok_and(|frontmatter| {
        frontmatter
            .data
            .iter()
            .any(|(key, value)| key.as_str() == Some("manual") && value.as_bool() == Some(true))
    })
}

/// Every status path outside the change's `tasks.md` and `.run/`, sorted.
///
/// Implements: rust-run/worktree-checks
fn dirt(status: &[StatusEntry], change: &str) -> Vec<String> {
    let tasks = format!("{change}/tasks.md");
    let run = format!("{change}/.run/");
    let mut dirt = BTreeSet::new();
    for entry in status {
        for candidate in std::iter::once(&entry.path).chain(entry.from.iter()) {
            if candidate == &tasks || candidate.starts_with(&run) {
                continue;
            }
            dirt.insert(candidate.clone());
        }
    }
    dirt.into_iter().collect()
}

/// Builds the failed error for a check that could not read git.
fn failed(message: String) -> FeatureError {
    FeatureError::failed("run", message)
}
