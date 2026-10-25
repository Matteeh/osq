//! Running `sync`: settings, the worktree change, its dirt and the sync commit.

use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::load_config;
use osq_kernel_storage::{read_land_facts, read_now_facts, read_watch_state};
use osq_kernel_sync::{SyncKind, SyncOptions, SyncOutcome, SyncRequest, append_sync_stopped};
use osq_kernel_vcs::{Vcs, project_git_root};

use super::{checks, failed_in, find, git_vcs, land_default_branch, text, worktree_changes};

/// The command every failure names.
const SYNC: &str = "sync";

/// Runs `sync` for one query, returning its output text.
///
/// # Errors
///
/// Returns a `Failed` error with the command `sync` for every failure "Sync
/// command" names.
///
/// Implements: rust-land/sync-command
/// Implements: rust-vcs/project-root-check
pub(crate) fn run(root: &Path, query: &str) -> Result<String, FeatureError> {
    let config = load_config(root).map_err(|error| failed_in(SYNC, error.to_string()))?;
    let repo =
        project_git_root(root, &config).map_err(|error| failed_in(SYNC, error.to_string()))?;
    let (timeouts, settings, limits) = (config.timeouts, config.vcs, config.limits);
    if repo.is_none() {
        return Err(failed_in(SYNC, text::SYNC_NEEDS_GIT));
    }
    let vcs = git_vcs(root, &timeouts);
    let worktrees = worktree_changes(&vcs, root, SYNC)?;
    let Some((change, kind)) = locate(&worktrees, query) else {
        return Err(failed_in(SYNC, text::no_change(query)));
    };
    let change_rel = match kind {
        SyncKind::Archived => format!("openspec/changes/archive/{}", change.folder),
        SyncKind::Active => format!("openspec/changes/{}", change.folder),
    };
    let folder = change.path.join(&change_rel);
    refuse_watcher(root, change, query)?;
    if let Some(message) = running_task(&folder, query) {
        return Err(failed_in(SYNC, message));
    }
    let facts = read_land_facts(&folder);
    if let Some(message) = checks::stacked_sync(&change.folder, &facts) {
        return Err(failed_in(SYNC, message));
    }
    let status = git_vcs(&change.path, &timeouts)
        .status()
        .map_err(|error| failed_in(SYNC, error.to_string()))?;
    if let Some(message) = checks::unclean_sync(&change.path, &status, &change_rel) {
        return Err(failed_in(SYNC, message));
    }
    let default_branch = land_default_branch(&vcs, &settings, SYNC)?;
    let request = SyncRequest {
        worktree: &change.path,
        folder: &change.folder,
        kind,
        default_branch: &default_branch,
        settings: &settings,
        timeouts: &timeouts,
        limits: &limits,
        options: SyncOptions {
            records: false,
            verify: true,
            tasks: None,
        },
    };
    let synced = sync_change(&request, &folder)?;
    Ok(if synced.is_some() {
        text::synced(&change.folder, &default_branch)
    } else {
        text::already_has(&change.folder, &default_branch)
    })
}

/// The change and kind a query names, archived first and then approved.
///
/// Implements: rust-land/sync-command
fn locate<'a>(
    worktrees: &'a [find::WorktreeChange],
    query: &str,
) -> Option<(&'a find::WorktreeChange, SyncKind)> {
    if let Some(change) = find::archived_change(worktrees, query) {
        return Some((change, SyncKind::Archived));
    }
    find::approved_change(worktrees, query).map(|change| (change, SyncKind::Active))
}

/// Refuses while a service or watcher record names a live watcher.
///
/// Implements: rust-land/sync-command
fn refuse_watcher(
    root: &Path,
    change: &find::WorktreeChange,
    query: &str,
) -> Result<(), FeatureError> {
    let home = std::env::var_os("HOME").map_or_else(PathBuf::new, PathBuf::from);
    let watch = read_watch_state(root, &home);
    let pid = watch
        .service
        .as_ref()
        .map(|record| record.pid)
        .or_else(|| watch.watcher.as_ref().map(|record| record.pid));
    match pid {
        Some(pid) => Err(failed_in(
            SYNC,
            format!(
                "a watcher runs for this project (pid {pid}); it syncs {} before the change's next attempt, or stop it and run osq sync {query} again",
                change.folder
            ),
        )),
        None => Ok(()),
    }
}

/// The refusal while a task still runs, or none when none does.
///
/// Implements: rust-land/sync-command
fn running_task(folder: &Path, query: &str) -> Option<String> {
    let facts = read_now_facts(folder);
    let running = facts
        .tasks
        .iter()
        .any(|task| task.running && !task.regressed && !task.done && !task.dead);
    if !running {
        return None;
    }
    let name = folder.file_name()?.to_string_lossy();
    Some(format!(
        "{name} has a task running; run osq sync {query} after it ends"
    ))
}

/// Runs the sync of one kind and records an active sync's failure.
///
/// Implements: rust-land/sync-command
/// Implements: rust-land/active-sync
fn sync_change(request: &SyncRequest<'_>, change: &Path) -> Result<Option<String>, FeatureError> {
    match osq_kernel_sync::sync_change(request) {
        Ok(SyncOutcome::AlreadySynced) => Ok(None),
        Ok(SyncOutcome::Synced { commit }) => Ok(Some(commit)),
        Err(stop) => {
            if request.kind == SyncKind::Active {
                append_sync_stopped(change, &stop, request.default_branch);
            }
            Err(failed_in(SYNC, stop.message))
        }
    }
}
