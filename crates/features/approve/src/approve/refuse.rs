//! The refusals and rejected branch claim that run before a worktree approval writes.

mod kept;
#[path = "stack.rs"]
mod stack;
mod text;

use std::collections::BTreeSet;
use std::path::Path;

use osq_core::{FeatureError, scope_covers_path};
use osq_kernel_config::{Config, ManualEdits};
use osq_kernel_storage::{ChangeSnapshot, TaskFile};
use osq_kernel_vcs::{GitVcs, Vcs};

use super::{ApproveOptions, failed};

/// Checks every refusal, then decides whether the rejected branch must move aside.
///
/// # Errors
///
/// Returns a `Failed` error with the command `approve` and the refusal's text
/// when HEAD is off the default branch, a task-scoped path is dirty, the change
/// would stack or its branch is taken, and the display of a git error when a
/// read fails.
///
/// Implements: rust-approve/approval-refusals-with-git-on
/// Implements: rust-approve/stacked-approval-refusal
/// Implements: rust-approve/rejected-branch-claim
pub(crate) fn check(
    repo: &Path,
    config: &Config,
    snapshot: &ChangeSnapshot,
    folder: &str,
    options: ApproveOptions,
) -> Result<Option<String>, FeatureError> {
    let vcs = GitVcs::new(repo).with_timeouts(&config.timeouts);
    let fallback = config.vcs.default_branch.as_deref().unwrap_or("main");
    refuse_base(&vcs, fallback, options.base_ok)?;
    refuse_dirty(
        &vcs,
        &snapshot.tasks,
        config.vcs.manual_edits,
        options.ignore_dirty,
    )?;
    stack::refuse(repo, config, folder)?;
    claim(&vcs, folder)
}

/// Refuses HEAD unless it is on the default branch or `--base-ok` was given.
///
/// Implements: rust-approve/approval-refusals-with-git-on
fn refuse_base(vcs: &GitVcs, fallback: &str, base_ok: bool) -> Result<(), FeatureError> {
    if base_ok {
        return Ok(());
    }
    let head = vcs.head().map_err(|error| failed(&error.to_string()))?;
    let default = vcs
        .default_branch(fallback)
        .map_err(|error| failed(&error.to_string()))?;
    if head.branch.as_deref() == Some(default.as_str()) {
        return Ok(());
    }
    Err(failed(&text::off_default(head.branch.as_deref(), &default)))
}

/// Refuses uncommitted paths that any task's scope covers, unless `--ignore-dirty`.
///
/// Implements: rust-approve/approval-refusals-with-git-on
fn refuse_dirty(
    vcs: &GitVcs,
    tasks: &[TaskFile],
    manual: ManualEdits,
    ignore_dirty: bool,
) -> Result<(), FeatureError> {
    if ignore_dirty {
        return Ok(());
    }
    let scopes: Vec<String> = tasks
        .iter()
        .flat_map(|task| task.plan.scope.iter().cloned())
        .collect();
    let mut dirty = BTreeSet::new();
    for entry in vcs.status().map_err(|error| failed(&error.to_string()))? {
        if scope_covers_path(&scopes, &entry.path) {
            dirty.insert(entry.path);
        }
        if let Some(from) = entry.from {
            if scope_covers_path(&scopes, &from) {
                dirty.insert(from);
            }
        }
    }
    if dirty.is_empty() {
        return Ok(());
    }
    let paths: Vec<String> = dirty.into_iter().collect();
    Err(failed(&text::dirty(&paths, manual)))
}

/// Refuses a taken branch, or names the kept branch a rejected one must take.
///
/// Implements: rust-approve/approval-refusals-with-git-on
/// Implements: rust-approve/rejected-branch-claim
fn claim(vcs: &GitVcs, folder: &str) -> Result<Option<String>, FeatureError> {
    let branch = format!("osq/{folder}");
    let exists = vcs
        .list_branches(&branch)
        .map_err(|error| failed(&error.to_string()))?
        .iter()
        .any(|found| found == &branch);
    if !exists {
        return Ok(None);
    }
    let record = format!("openspec/changes/rejected/{folder}/.run/rejected.md");
    let checked_out = vcs
        .worktree_list()
        .map_err(|error| failed(&error.to_string()))?
        .iter()
        .any(|tree| tree.branch.as_deref() == Some(branch.as_str()));
    let rejected = vcs
        .path_exists(&branch, &record)
        .map_err(|error| failed(&error.to_string()))?;
    if !rejected || checked_out {
        return Err(failed(&text::branch_exists(&branch)));
    }
    let taken = vcs
        .list_branches(&format!("{branch}-rejected-"))
        .map_err(|error| failed(&error.to_string()))?;
    Ok(Some(kept::next(&branch, &taken)))
}
