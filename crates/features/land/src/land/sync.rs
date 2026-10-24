//! Taking the default branch into a change's branch before land.

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
mod text;
mod verify;

use std::path::{Path, PathBuf};
use std::time::Instant;

use osq_core::FeatureError;
use osq_core::event::SyncStopReason;
use osq_kernel_config::{Limits, Timeouts, VcsConfig};
use osq_kernel_vcs::{GitVcs, MergeOutcome, Vcs};

use super::failed_in;
use stop::Stop;

/// The kind of change a sync takes the default branch into.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Kind {
    /// A change under `openspec/changes/archive/`.
    Archived,
    /// An approved change under `openspec/changes/`.
    Active,
}

/// Who runs the sync: the command its errors name and whether a stop is recorded.
///
/// Implements: rust-land/land-sync
#[derive(Clone, Copy)]
pub(super) struct Caller<'a> {
    /// The command every failure names.
    pub(super) command: &'a str,
    /// Whether a stop writes the land stop record.
    pub(super) records: bool,
}

/// The settings, timeouts and limits every sync step reads.
pub(super) struct Controls<'a> {
    /// The version control settings, including `vcs.prepare`.
    pub(super) settings: &'a VcsConfig,
    /// Every timeout the sync applies.
    pub(super) timeouts: &'a Timeouts,
    /// Every output limit the sync applies.
    pub(super) limits: &'a Limits,
}

/// Why a sync failed, with the stop reason an active sync records.
#[derive(Debug)]
pub(super) struct Failure {
    /// The stop's reason, or `sync_failed` for any other error.
    pub(super) reason: SyncStopReason,
    /// The failure's message.
    pub(super) message: String,
}

impl Failure {
    /// Builds a `sync_failed` failure from a message.
    fn failed(message: impl Into<String>) -> Self {
        Self {
            reason: SyncStopReason::SyncFailed,
            message: message.into(),
        }
    }

    /// Builds a failure from a stop.
    fn stop(stop: &Stop) -> Self {
        Self {
            reason: stop.reason,
            message: stop.message.clone(),
        }
    }
}

/// One started sync, with everything its stops need to restore the branch.
struct Sync<'a> {
    /// The command and record rules of the sync's caller.
    caller: Caller<'a>,
    /// The git reads and writes the sync makes in the change's worktree.
    vcs: GitVcs,
    /// The change's worktree.
    worktree: &'a Path,
    /// The change's folder name.
    folder: &'a str,
    /// The kind of change, which picks the verify and recertification steps.
    kind: Kind,
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
    settings: &'a VcsConfig,
    /// Every timeout the sync applies.
    timeouts: &'a Timeouts,
    /// Every output limit the sync applies.
    limits: &'a Limits,
}

/// Syncs an archived change, giving its commit when it writes one.
///
/// Returns none when the default branch is already an ancestor of the
/// worktree's HEAD, so no sync commit is written.
///
/// # Errors
///
/// Returns a `Failed` error with the caller's command for every stop "Land
/// sync" and "Land stop record" name.
///
/// Implements: rust-land/land-sync
pub(crate) fn run(
    worktree: &Path,
    folder: &str,
    default_branch: &str,
    controls: &Controls<'_>,
    caller: Caller<'_>,
) -> Result<Option<String>, FeatureError> {
    run_kind(
        worktree,
        folder,
        Kind::Archived,
        default_branch,
        controls,
        caller,
    )
    .map_err(|failure| failed_in(caller.command, failure.message))
}

/// Syncs an approved active change, giving its commit when it writes one.
///
/// # Errors
///
/// Returns the failure whose message `sync` reports; its reason is what the
/// active sync's `sync_stopped` event records.
///
/// Implements: rust-land/active-sync
pub(crate) fn run_active(
    worktree: &Path,
    folder: &str,
    default_branch: &str,
    controls: &Controls<'_>,
    caller: Caller<'_>,
) -> Result<Option<String>, Failure> {
    run_kind(
        worktree,
        folder,
        Kind::Active,
        default_branch,
        controls,
        caller,
    )
}

/// Syncs one change of either kind, giving its commit when it writes one.
fn run_kind(
    worktree: &Path,
    folder: &str,
    kind: Kind,
    default_branch: &str,
    controls: &Controls<'_>,
    caller: Caller<'_>,
) -> Result<Option<String>, Failure> {
    let vcs = GitVcs::new(worktree).with_timeouts(controls.timeouts);
    let head = vcs
        .head()
        .map_err(|error| Failure::failed(error.to_string()))?
        .sha;
    if let Some(head) = head.as_deref() {
        let ancestor = vcs
            .is_ancestor(default_branch, head)
            .map_err(|error| Failure::failed(error.to_string()))?;
        if ancestor {
            return Ok(None);
        }
    }
    let (change, change_rel) = change_path(worktree, folder, kind);
    let events = change.join(".run").join("events").join("change.jsonl");
    let kept_events = files::read(&events);
    let commits = vcs
        .count_commits(head.as_deref().unwrap_or("HEAD"), default_branch)
        .map_err(|error| Failure::failed(error.to_string()))?;
    let mut context = Sync {
        caller,
        vcs,
        worktree,
        folder,
        kind,
        change,
        change_rel,
        default_branch,
        events,
        kept_events,
        picked: Vec::new(),
        backups: Vec::new(),
        commits,
        author: controls.settings.author.clone().unwrap_or_default(),
        settings: controls.settings,
        timeouts: controls.timeouts,
        limits: controls.limits,
    };
    let checked = check::run(&context.vcs, &context.change, default_branch)
        .map_err(|error| Failure::failed(error.to_string()))?;
    if let Some(stop) = checked {
        return Err(context.finish(&stop));
    }
    if context.kind == Kind::Active {
        context.picked = active::pick(&context.change, worktree);
    }
    context.run()
}

/// The change folder and its worktree-relative path.
fn change_path(worktree: &Path, folder: &str, kind: Kind) -> (PathBuf, String) {
    let relative = match kind {
        Kind::Archived => format!("openspec/changes/archive/{folder}"),
        Kind::Active => format!("openspec/changes/{folder}"),
    };
    (worktree.join(&relative), relative)
}

impl Sync<'_> {
    /// Runs the merge through the sync commit.
    ///
    /// # Errors
    ///
    /// Returns the failure a stop gives.
    fn run(&mut self) -> Result<Option<String>, Failure> {
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
            Ok(commit) => Ok(Some(commit)),
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
        match self.kind {
            Kind::Archived => verify::run(
                self.worktree,
                &self.change,
                self.folder,
                self.default_branch,
                self.timeouts,
                self.limits,
            )?,
            Kind::Active => {
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
    fn finish(&self, stop: &Stop) -> Failure {
        let _ = self.vcs.merge_abort();
        let _ = files::restore(&self.events, self.kept_events.as_deref());
        restore_recertified(&self.backups);
        if self.caller.records
            && stop::records(stop.reason)
            && let Err(message) =
                stop::record(&self.vcs, &self.change, self.folder, &self.author, stop)
        {
            return Failure {
                reason: stop.reason,
                message: format!("{}\n{}", stop.message, message),
            };
        }
        Failure::stop(stop)
    }
}

/// Puts every file a recertification wrote back as it was.
fn restore_recertified(backups: &recertify::Backups) {
    for (path, before) in backups {
        let _ = files::restore(path, before.as_deref());
    }
}
