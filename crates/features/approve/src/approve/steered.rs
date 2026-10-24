//! Sealing a steered change, appending its `approved` event and committing it.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use osq_core::FeatureError;
use osq_core::event::{ApprovedData, Envelope, Event, event_line};
use osq_kernel_config::Config;
use osq_kernel_storage::{ChangeEntry, ChangeSnapshot, ChangeTree, change_folder_seal};
use osq_kernel_vcs::{GitVcs, Vcs};

use super::steering::Trigger;
use super::{failed, text, worktree};
use crate::reject::time;

/// Approves a steered change in its worktree, or in place with git off.
///
/// # Errors
///
/// Returns a `Failed` error with the command `approve` when the seal, marker
/// or event cannot be written, when a worktree approval has no author, and
/// with the commit failure's text when the worktree commit fails and does not
/// land; that failure puts the previous seal and event file back.
///
/// Implements: rust-approve/steered-approval
pub(crate) fn approve(
    entry: &ChangeEntry,
    snapshot: &ChangeSnapshot,
    triggers: &[Trigger],
    config: &Config,
    repo: Option<&Path>,
    tree: Option<&ChangeTree>,
) -> Result<String, FeatureError> {
    let worktree = tree
        .filter(|tree| tree.folder.is_some())
        .map(|tree| tree.root.as_path());
    let seal = change_folder_seal(&entry.path).map_err(|error| failed(&error.to_string()))?;
    if worktree.is_some() && config.vcs.author.is_none() {
        return Err(failed("vcs.author is required when vcs.enabled is true"));
    }
    let saved = SealFiles::snapshot(&entry.path);
    super::write_marker(&entry.path, seal.as_str()).map_err(|error| failed(&error.to_string()))?;
    append_event(&entry.path, seal.as_str(), triggers)?;
    if let Some((worktree, checkout)) = worktree.zip(repo)
        && let Err(error) = worktree::commit_recorded(checkout, worktree, &entry.folder, config)
        && !landed(worktree, &entry.folder, seal.as_str(), config)
    {
        saved.restore(&entry.path)?;
        return Err(failed(&text::commit_failed(
            worktree,
            &entry.folder,
            &error,
        )));
    }
    let continues = continues_from(snapshot);
    Ok(text::steered(
        &entry.folder,
        seal.as_str(),
        worktree,
        continues.as_deref(),
    ))
}

/// The first task without a done marker or with a regressed marker.
///
/// Implements: rust-approve/steered-approval
fn continues_from(snapshot: &ChangeSnapshot) -> Option<String> {
    snapshot
        .tasks
        .iter()
        .find(|task| !task.done || task.markers.regressed.is_some())
        .map(|task| task.id.to_string())
}

/// Whether HEAD holds `seal` at the change folder's `.run/approved`.
///
/// Implements: rust-approve/steered-approval
fn landed(worktree: &Path, folder: &str, seal: &str, config: &Config) -> bool {
    let path = format!("openspec/changes/{folder}/.run/approved");
    GitVcs::new(worktree)
        .with_timeouts(&config.timeouts)
        .show("HEAD", &path)
        .is_ok_and(|text| text.is_some_and(|text| text.trim() == seal.trim()))
}

/// The two seal files a failed commit puts back.
struct SealFiles {
    /// `.run/approved`'s bytes, or none when it was absent.
    approved: Option<Vec<u8>>,
    /// `.run/events/change.jsonl`'s bytes, or none when it was absent.
    events: Option<Vec<u8>>,
}

impl SealFiles {
    /// Reads both seal files before the approval writes them.
    ///
    /// Implements: rust-approve/steered-approval
    fn snapshot(folder: &Path) -> Self {
        let run = folder.join(".run");
        Self {
            approved: fs::read(run.join("approved")).ok(),
            events: fs::read(run.join("events").join("change.jsonl")).ok(),
        }
    }

    /// Puts both seal files back, removing one that was absent.
    ///
    /// # Errors
    ///
    /// Returns a `Failed` error with the command `approve` when a file cannot
    /// be written or removed.
    ///
    /// Implements: rust-approve/steered-approval
    fn restore(&self, folder: &Path) -> Result<(), FeatureError> {
        let run = folder.join(".run");
        restore(&run.join("approved"), self.approved.as_deref())?;
        restore(
            &run.join("events").join("change.jsonl"),
            self.events.as_deref(),
        )
    }
}

/// Writes one file's bytes back, or removes the file when it had none.
///
/// Implements: rust-approve/steered-approval
fn restore(path: &Path, bytes: Option<&[u8]>) -> Result<(), FeatureError> {
    let Some(bytes) = bytes else {
        fs::remove_file(path).ok();
        return Ok(());
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| write_error(parent, &error))?;
    }
    fs::write(path, bytes).map_err(|error| write_error(path, &error))
}

/// Appends one `approved` event naming the seal and each trigger's target.
///
/// Implements: rust-approve/steered-approval
fn append_event(folder: &Path, seal: &str, triggers: &[Trigger]) -> Result<(), FeatureError> {
    let dir = folder.join(".run").join("events");
    fs::create_dir_all(&dir).map_err(|error| write_error(&dir, &error))?;
    let path = dir.join("change.jsonl");
    let envelope = Envelope {
        timestamp: time::now(),
        event: Event::Approved(ApprovedData {
            hash: seal.to_owned(),
            targets: triggers
                .iter()
                .map(|trigger| trigger.target.clone())
                .collect(),
        }),
    };
    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(&path)
        .map_err(|error| write_error(&path, &error))?;
    file.write_all(format!("{}\n", event_line(&envelope)).as_bytes())
        .map_err(|error| write_error(&path, &error))
}

/// The failed error for a path that could not be written.
///
/// Implements: rust-approve/steered-approval
fn write_error(path: &Path, error: &std::io::Error) -> FeatureError {
    failed(&format!("cannot write {}: {error}", path.display()))
}
