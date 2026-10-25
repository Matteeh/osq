//! Taking the default branch into a change's branch before land.

use std::path::{Path, PathBuf};
use std::time::Instant;

use osq_core::event::SyncStopReason;
use osq_kernel_vcs::{GitVcs, MergeOutcome, Vcs};

use crate::{SyncKind, SyncOptions, SyncOutcome, SyncRequest, SyncStop};

use super::{
    active, check, event, files, locks, prepare, recertify, specs,
    stop::{self, Stop},
    text, verify,
};

/// Builds a `sync_failed` stop from a message.
fn failed(message: impl Into<String>) -> SyncStop {
    SyncStop {
        reason: SyncStopReason::SyncFailed,
        message: message.into(),
        conflicts: Vec::new(),
    }
}

/// Turns a private stop into the public stop a caller sees.
fn stopped(stop: &Stop) -> SyncStop {
    SyncStop {
        reason: stop.reason,
        message: stop.message.clone(),
        conflicts: stop.conflicts.clone(),
    }
}

/// One started sync, with everything its stops need to restore the branch.
struct Sync<'a> {
    /// The caller's choices for recording stops, verifying and picking tasks.
    options: &'a SyncOptions,
    /// The git reads and writes the sync makes in the change's worktree.
    vcs: GitVcs,
    /// The change's worktree.
    worktree: &'a Path,
    /// The change's folder name.
    folder: &'a str,
    /// The kind of change, which picks the verify and recertification steps.
    kind: SyncKind,
    /// The change's folder in the worktree.
    change: PathBuf,
    /// The change folder's worktree-relative POSIX path.
    change_rel: String,
    /// The default branch the sync merges.
    default_branch: &'a str,
    /// The change stream's path in the change folder.
    events: PathBuf,
    /// The change stream's bytes before the sync, or none when it was absent.
    kept_events: Option<Vec<u8>>,
    /// The done tasks an active sync verifies, in numeric order.
    picked: Vec<active::Picked>,
    /// The done-marker and task-event files a recertification overwrote.
    backups: recertify::Backups,
    /// How many commits the default branch gained.
    commits: u64,
    /// The author every sync commit carries.
    author: String,
    /// The version control settings, including `vcs.prepare`.
    settings: &'a osq_kernel_config::VcsConfig,
    /// Every timeout the sync applies.
    timeouts: &'a osq_kernel_config::Timeouts,
    /// Every output limit the sync applies.
    limits: &'a osq_kernel_config::Limits,
}

/// Syncs one change of either kind, giving the outcome its caller sees.
pub(crate) fn run(request: &SyncRequest<'_>) -> Result<SyncOutcome, SyncStop> {
    let vcs = GitVcs::new(request.worktree).with_timeouts(request.timeouts);
    let head = vcs.head().map_err(|error| failed(error.to_string()))?.sha;
    if let Some(head) = head.as_deref() {
        let ancestor = vcs
            .is_ancestor(request.default_branch, head)
            .map_err(|error| failed(error.to_string()))?;
        if ancestor {
            return Ok(SyncOutcome::AlreadySynced);
        }
    }
    let (change, change_rel) = change_path(request.worktree, request.folder, request.kind);
    let events = change.join(".run").join("events").join("change.jsonl");
    let kept_events = files::read(&events);
    let commits = vcs
        .count_commits(head.as_deref().unwrap_or("HEAD"), request.default_branch)
        .map_err(|error| failed(error.to_string()))?;
    let mut context = Sync {
        options: &request.options,
        vcs,
        worktree: request.worktree,
        folder: request.folder,
        kind: request.kind,
        change,
        change_rel,
        default_branch: request.default_branch,
        events,
        kept_events,
        picked: Vec::new(),
        backups: Vec::new(),
        commits,
        author: request.settings.author.clone().unwrap_or_default(),
        settings: request.settings,
        timeouts: request.timeouts,
        limits: request.limits,
    };
    let checked = check::run(&context.vcs, &context.change, request.default_branch)
        .map_err(|error| failed(error.to_string()))?;
    if let Some(stop) = checked {
        return Err(context.finish(&stop));
    }
    if context.kind == SyncKind::Active {
        context.picked = active::pick(&context.change, request.worktree);
        if let Some(ids) = &request.options.tasks {
            context.picked.retain(|task| ids.contains(&task.id));
        }
    }
    context.run()
}

/// The change folder and its worktree-relative path.
fn change_path(worktree: &Path, folder: &str, kind: SyncKind) -> (PathBuf, String) {
    let relative = match kind {
        SyncKind::Archived => format!("openspec/changes/archive/{folder}"),
        SyncKind::Active => format!("openspec/changes/{folder}"),
    };
    (worktree.join(&relative), relative)
}

impl Sync<'_> {
    /// Runs the merge through the sync commit.
    ///
    /// # Errors
    ///
    /// Returns the stop a step raises.
    fn run(&mut self) -> Result<SyncOutcome, SyncStop> {
        let start = Instant::now();
        let merge = match self.vcs.merge(self.default_branch, false) {
            Ok(merge) => merge,
            Err(error) => {
                let stop = Stop::vcs(&error);
                return Err(self.finish(&stop));
            }
        };
        let conflicts = match merge {
            MergeOutcome::Clean => Vec::new(),
            MergeOutcome::Conflict { paths } => paths,
        };
        if let Some(stop) = text::conflict_stop(self.folder, self.default_branch, &conflicts) {
            return Err(self.finish(&stop));
        }
        match self.steps(&conflicts, start) {
            Ok(commit) => Ok(SyncOutcome::Synced { commit }),
            Err(stop) => Err(self.finish(&stop)),
        }
    }

    /// Steps 3 through 6 of a started merge, giving the sync commit.
    ///
    /// # Errors
    ///
    /// Returns the stop a step or the commit raises.
    fn steps(&mut self, conflicts: &[String], start: Instant) -> Result<String, Stop> {
        specs::rebuild(
            &self.vcs,
            self.worktree,
            &self.change,
            self.kind,
            self.default_branch,
            conflicts,
        )?;
        locks::rebuild(
            &self.vcs,
            self.worktree,
            self.folder,
            self.default_branch,
            conflicts,
            self.timeouts,
            self.limits,
        )?;
        prepare::run(
            self.worktree,
            self.folder,
            self.settings.prepare.as_deref(),
            self.timeouts,
        )?;
        if self.options.verify {
            match self.kind {
                SyncKind::Archived => verify::run(
                    self.worktree,
                    &self.change,
                    self.folder,
                    self.default_branch,
                    self.timeouts,
                    self.limits,
                )?,
                SyncKind::Active => {
                    verify::run_active(
                        self.worktree,
                        &self.change,
                        self.folder,
                        self.default_branch,
                        self.timeouts,
                        self.limits,
                        &self.picked,
                    )?;
                    recertify::run(
                        &self.vcs,
                        self.worktree,
                        &self.change,
                        &self.change_rel,
                        &self.picked,
                        &mut self.backups,
                    )?;
                }
            }
        }
        event::synced(
            &self.vcs,
            &self.events,
            &self.change_rel,
            self.default_branch,
            self.commits,
            start,
        )?;
        let message = text::sync_message(self.folder, self.default_branch);
        self.vcs
            .commit(&[], &message, &self.author)
            .map_err(|error| Stop::vcs(&error))
    }

    /// Undoes the stop's writes, records the stops that need a record, and fails.
    ///
    /// Implements: rust-land/land-sync
    /// Implements: rust-land/land-stop-record
    fn finish(&self, stop: &Stop) -> SyncStop {
        let _ = self.vcs.merge_abort();
        let _ = files::restore(&self.events, self.kept_events.as_deref());
        restore_recertified(&self.backups);
        if self.options.records
            && stop::records(stop.reason)
            && let Err(message) =
                stop::record(&self.vcs, &self.change, self.folder, &self.author, stop)
        {
            return SyncStop {
                reason: stop.reason,
                message: format!("{}\n{}", stop.message, message),
                conflicts: stop.conflicts.clone(),
            };
        }
        stopped(stop)
    }
}

/// Puts every file a recertification wrote back as it was.
fn restore_recertified(backups: &recertify::Backups) {
    for (path, before) in backups {
        let _ = files::restore(path, before.as_deref());
    }
}
