//! Sync kernel: takes the default branch into a change's branch (ADR 022).
//!
//! A kernel crate depends only on core and other kernel crates (ADR 022).

mod active;
mod check;
mod command;
mod event;
mod files;
mod locks;
mod prepare;
mod recertify;
mod specs;
mod stop;
mod sync;
mod text;
mod time;
mod verify;

use std::fs::{self, OpenOptions};
use std::io::Write as _;
use std::path::Path;

use osq_core::event::{Envelope, Event, SyncStopReason, SyncStoppedData, event_line};
use osq_kernel_config::{Limits, Timeouts, VcsConfig};

/// The kind of change a sync takes the default branch into.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SyncKind {
    /// A change under `openspec/changes/archive/`.
    Archived,
    /// An approved change under `openspec/changes/`.
    Active,
}

/// The caller's choices for recording stops, verifying and picking tasks.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SyncOptions {
    /// Whether a stop the land stop record names writes that record.
    pub records: bool,
    /// Whether the sync runs its verify and recertification steps.
    pub verify: bool,
    /// The done tasks to verify, or every picked one when absent.
    pub tasks: Option<Vec<String>>,
}

/// The change a sync takes the default branch into, with every setting it reads.
pub struct SyncRequest<'a> {
    /// The worktree that has the change's branch checked out.
    pub worktree: &'a Path,
    /// The change's folder name, without its `openspec/changes` prefix.
    pub folder: &'a str,
    /// Whether the change is archived or active.
    pub kind: SyncKind,
    /// The branch the sync merges into the change's branch.
    pub default_branch: &'a str,
    /// The version control settings, including `vcs.prepare`.
    pub settings: &'a VcsConfig,
    /// Every timeout the sync applies.
    pub timeouts: &'a Timeouts,
    /// Every output limit the sync applies.
    pub limits: &'a Limits,
    /// The caller's choices for recording stops, verifying and picking tasks.
    pub options: SyncOptions,
}

/// What a finished sync wrote.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SyncOutcome {
    /// The default branch was already an ancestor of the worktree's HEAD.
    AlreadySynced,
    /// The sync committed, with the sync commit's sha.
    Synced {
        /// The sync commit's sha.
        commit: String,
    },
}

/// Why a sync stopped, with the message the command fails with.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SyncStop {
    /// The stop's reason, or `sync_failed` for any other error.
    pub reason: SyncStopReason,
    /// The text the command fails with.
    pub message: String,
    /// The conflicted paths a `sync_conflict` stop names, in merge order.
    pub conflicts: Vec<String>,
}

/// Takes the default branch into the branch checked out in the request's worktree.
///
/// # Errors
///
/// Returns a `SyncStop` for every stop and every other error, after undoing the
/// sync's own writes.
///
/// Implements: rust-sync/sync-change
/// Implements: rust-sync/default-branch-resolution
pub fn sync_change(request: &SyncRequest<'_>) -> Result<SyncOutcome, SyncStop> {
    sync_change_taking_default(request, &[])
}

/// Takes the default branch in, resolving the listed conflicted paths to it.
///
/// A path in `paths` that conflicts keeps the default branch's version; every
/// other conflict still stops the sync.
///
/// # Errors
///
/// Returns a `SyncStop` for every stop and every other error, after undoing the
/// sync's own writes.
///
/// Implements: rust-sync/default-branch-resolution
pub fn sync_change_taking_default(
    request: &SyncRequest<'_>,
    paths: &[String],
) -> Result<SyncOutcome, SyncStop> {
    sync::run(request, paths)
}

/// Appends the active sync's uncommitted `sync_stopped` event.
///
/// Implements: rust-sync/sync-stopped-event
pub fn append_sync_stopped(change: &Path, stop: &SyncStop, default_branch: &str) {
    let path = change.join(".run").join("events").join("change.jsonl");
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let data = SyncStoppedData {
        reason: stop.reason,
        message: stop.message.clone(),
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
