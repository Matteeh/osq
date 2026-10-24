//! Running `sync`: settings, the worktree change, its dirt and the sync commit.

use std::fs::{self, OpenOptions};
use std::io::Write as _;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_core::event::{Envelope, Event, SyncStopReason, SyncStoppedData, event_line};
use osq_kernel_config::load_config;
use osq_kernel_storage::{read_land_facts, read_now_facts, read_watch_state};
use osq_kernel_vcs::{Vcs, project_git_root};

use super::sync::{self, Caller, Kind};
use super::{checks, failed_in, find, git_vcs, land_default_branch, text, time, worktree_changes};

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
        Kind::Archived => format!("openspec/changes/archive/{}", change.folder),
        Kind::Active => format!("openspec/changes/{}", change.folder),
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
    let controls = sync::Controls {
        settings: &settings,
        timeouts: &timeouts,
        limits: &limits,
    };
    let synced = sync_change(
        &change.path,
        &change.folder,
        &folder,
        kind,
        &default_branch,
        &controls,
    )?;
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
) -> Option<(&'a find::WorktreeChange, Kind)> {
    if let Some(change) = find::archived_change(worktrees, query) {
        return Some((change, Kind::Archived));
    }
    find::approved_change(worktrees, query).map(|change| (change, Kind::Active))
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
fn sync_change(
    worktree: &Path,
    folder: &str,
    change: &Path,
    kind: Kind,
    default_branch: &str,
    controls: &sync::Controls<'_>,
) -> Result<Option<String>, FeatureError> {
    let caller = Caller {
        command: SYNC,
        records: false,
    };
    match kind {
        Kind::Archived => sync::run(worktree, folder, default_branch, controls, caller),
        Kind::Active => {
            match sync::run_active(worktree, folder, default_branch, controls, caller) {
                Ok(synced) => Ok(synced),
                Err(failure) => {
                    append_stopped(change, failure.reason, &failure.message, default_branch);
                    Err(failed_in(SYNC, failure.message))
                }
            }
        }
    }
}

/// Appends the active sync's uncommitted `sync_stopped` event.
///
/// Implements: rust-land/active-sync
fn append_stopped(change: &Path, reason: SyncStopReason, message: &str, default_branch: &str) {
    let path = change.join(".run").join("events").join("change.jsonl");
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let data = SyncStoppedData {
        reason,
        message: message.to_owned(),
        default_branch: default_branch.to_owned(),
    };
    let envelope = Envelope {
        timestamp: time::format_utc(time::now_ms()),
        event: Event::SyncStopped(data),
    };
    let line = format!("{}\n", event_line(&envelope));
    if let Ok(mut file) = OpenOptions::new().append(true).create(true).open(path) {
        let _ = file.write_all(line.as_bytes());
    }
}
