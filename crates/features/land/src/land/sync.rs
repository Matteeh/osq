//! Taking the default branch into a change's branch before land.

mod check;
mod command;
mod event;
mod files;
mod locks;
mod prepare;
mod specs;
mod stop;
mod text;
mod verify;

use std::path::{Path, PathBuf};
use std::time::Instant;

use osq_core::FeatureError;
use osq_kernel_config::{Timeouts, VcsConfig};
use osq_kernel_vcs::{GitVcs, MergeOutcome, Vcs};

use super::failed;
use stop::Stop;

/// One started sync, with everything its stops need to restore the branch.
struct Sync<'a> {
    /// The git reads and writes the sync makes in the change's worktree.
    vcs: GitVcs,
    /// The change's worktree.
    worktree: &'a Path,
    /// The change's folder name.
    folder: &'a str,
    /// The default branch the sync merges.
    default_branch: &'a str,
    /// The archived folder in the worktree.
    archived: PathBuf,
    /// The change stream's path in the archived folder.
    events: PathBuf,
    /// The change stream's bytes before the sync, or none when it was absent.
    kept_events: Option<Vec<u8>>,
    /// How many commits the default branch gained.
    commits: u64,
    /// The author every sync commit carries.
    author: String,
    /// The version control settings, including `vcs.prepare`.
    settings: &'a VcsConfig,
    /// Every timeout the sync applies.
    timeouts: &'a Timeouts,
}

/// Syncs the default branch into the change's branch, giving its commit.
///
/// Returns none when the default branch is already an ancestor of the
/// worktree's HEAD, so no sync commit is written.
///
/// # Errors
///
/// Returns a `Failed` error with the command `land` for every stop "Land sync"
/// and "Land stop record" name.
///
/// Implements: rust-land/land-sync
pub(crate) fn run(
    worktree: &Path,
    folder: &str,
    default_branch: &str,
    settings: &VcsConfig,
    timeouts: &Timeouts,
) -> Result<Option<String>, FeatureError> {
    let vcs = GitVcs::new(worktree).with_timeouts(timeouts);
    let head = vcs.head().map_err(|error| failed(error.to_string()))?.sha;
    if let Some(head) = head.as_deref() {
        let ancestor = vcs
            .is_ancestor(default_branch, head)
            .map_err(|error| failed(error.to_string()))?;
        if ancestor {
            return Ok(None);
        }
    }
    let archived = worktree
        .join("openspec")
        .join("changes")
        .join("archive")
        .join(folder);
    let events = archived.join(".run").join("events").join("change.jsonl");
    let kept_events = files::read(&events);
    let commits = vcs
        .count_commits(head.as_deref().unwrap_or("HEAD"), default_branch)
        .map_err(|error| failed(error.to_string()))?;
    let context = Sync {
        vcs,
        worktree,
        folder,
        default_branch,
        archived,
        events,
        kept_events,
        commits,
        author: settings.author.clone().unwrap_or_default(),
        settings,
        timeouts,
    };
    if let Some(stop) = check::run(&context.vcs, &context.archived, default_branch)? {
        return Err(context.finish(stop));
    }
    context.run()
}

impl Sync<'_> {
    /// Runs the merge through the sync commit.
    ///
    /// # Errors
    ///
    /// Returns the `Failed` error a stop gives.
    fn run(&self) -> Result<Option<String>, FeatureError> {
        let start = Instant::now();
        let merge = match self.vcs.merge(self.default_branch, false) {
            Ok(merge) => merge,
            Err(error) => return Err(self.finish(Stop::vcs(&error))),
        };
        let conflicts = match merge {
            MergeOutcome::Clean => Vec::new(),
            MergeOutcome::Conflict { paths } => paths,
        };
        if let Some(stop) = text::conflict_stop(self.folder, self.default_branch, &conflicts) {
            return Err(self.finish(stop));
        }
        match self.steps(&conflicts, start) {
            Ok(commit) => Ok(Some(commit)),
            Err(stop) => Err(self.finish(stop)),
        }
    }

    /// Steps 3 through 6 of a started merge, giving the sync commit.
    ///
    /// # Errors
    ///
    /// Returns the stop a step or the commit raises.
    fn steps(&self, conflicts: &[String], start: Instant) -> Result<String, Stop> {
        specs::rebuild(
            &self.vcs,
            self.worktree,
            &self.archived,
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
        )?;
        prepare::run(
            self.worktree,
            self.folder,
            self.settings.prepare.as_deref(),
            self.timeouts,
        )?;
        verify::run(
            self.worktree,
            &self.archived,
            self.folder,
            self.default_branch,
            self.timeouts,
        )?;
        event::synced(
            &self.vcs,
            &self.events,
            self.folder,
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
    fn finish(&self, stop: Stop) -> FeatureError {
        let _ = self.vcs.merge_abort();
        let _ = files::restore(&self.events, self.kept_events.as_deref());
        if stop::records(stop.reason) {
            if let Err(message) =
                stop::record(&self.vcs, &self.archived, self.folder, &self.author, &stop)
            {
                return failed(format!("{}\n{}", stop.message, message));
            }
        }
        failed(stop.message)
    }
}
