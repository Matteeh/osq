//! Rewriting and staging the done markers an active sync recertifies.

use std::fs::{self, OpenOptions};
use std::io::Write as _;
use std::path::{Path, PathBuf};

use osq_core::event::{Envelope, Event, RecertificationData, RecertificationOutcome, event_line};
use osq_kernel_storage::{differing_scope_paths, refresh_done_marker, task_scope_hash};
use osq_kernel_vcs::{GitVcs, Vcs};
use serde_json::json;

use super::active::Picked;
use super::stop::Stop;
use super::{files, time};

/// One file a recertification overwrote, kept so a stop can restore it.
pub(crate) type Backups = Vec<(PathBuf, Option<Vec<u8>>)>;

/// Recertifies each kept task whose merged-tree scope differs from its marker.
///
/// # Errors
///
/// Returns a `sync_failed` stop when a marker cannot be rewritten or staged.
///
/// Implements: rust-land/active-sync-recertification
pub(crate) fn run(
    vcs: &GitVcs,
    worktree: &Path,
    change: &Path,
    change_rel: &str,
    tasks: &[Picked],
    backups: &mut Backups,
) -> Result<(), Stop> {
    for task in tasks {
        let Some(recorded) = task.recorded.as_ref() else {
            continue;
        };
        let current = task_scope_hash(worktree, &task.scope);
        if current.hash == recorded.scope_hash {
            continue;
        }
        let done = change.join(".run").join("done").join(&task.id);
        let events = change
            .join(".run")
            .join("events")
            .join(format!("{}.jsonl", task.id));
        keep(backups, &done);
        keep(backups, &events);
        let now = time::format_utc(time::now_ms());
        refresh_done_marker(change, &task.id, &recorded.scope_hash, &current, &now)
            .map_err(|error| Stop::failed(error.to_string()))?;
        append_event(&events, task, recorded, &current)?;
        let paths = [
            format!("{change_rel}/.run/done/{}", task.id),
            format!("{change_rel}/.run/events/{}.jsonl", task.id),
        ];
        let refs: Vec<&str> = paths.iter().map(String::as_str).collect();
        vcs.stage(&refs).map_err(|error| Stop::vcs(&error))?;
    }
    Ok(())
}

/// Remembers one file's bytes once, before the sync overwrites it.
///
/// Implements: rust-land/active-sync-recertification
fn keep(backups: &mut Backups, path: &Path) {
    if backups.iter().any(|(kept, _)| kept == path) {
        return;
    }
    backups.push((path.to_path_buf(), files::read(path)));
}

/// Appends one automatic `recertification` event for the task.
///
/// Implements: rust-land/active-sync-recertification
fn append_event(
    path: &Path,
    task: &Picked,
    recorded: &osq_kernel_storage::DoneScope,
    current: &osq_kernel_storage::ScopeHash,
) -> Result<(), Stop> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| Stop::failed(error.to_string()))?;
    }
    let differing = differing_scope_paths(&recorded.scope_files, current);
    let attribution = differing
        .iter()
        .map(|entry| json!({"path": entry, "attribution": "sync"}))
        .collect();
    let data = RecertificationData {
        task: task.id.clone(),
        outcome: RecertificationOutcome::Passed,
        differing_paths: differing,
        attribution: serde_json::Value::Array(attribution),
        command: task.verify.clone(),
        exit_code: 0,
        output: None,
        timed_out: false,
        recorded_hash: recorded.scope_hash.clone(),
        current_hash: current.hash.clone(),
        attempt: None,
        reason: None,
        automatic: Some(true),
    };
    let envelope = Envelope {
        timestamp: time::format_utc(time::now_ms()),
        event: Event::Recertification(data),
    };
    let line = format!("{}\n", event_line(&envelope));
    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(path)
        .map_err(|error| Stop::failed(error.to_string()))?;
    file.write_all(line.as_bytes())
        .map_err(|error| Stop::failed(error.to_string()))
}
