//! Approving a worktree change past a default-branch trigger.

mod conflict;

use std::collections::BTreeSet;
use std::fs::{self, OpenOptions};
use std::io::Write as _;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_core::event::{
    Envelope, Event, RegressedData, RegressionReason, SyncStopReason, event_line,
};
use osq_kernel_config::Config;
use osq_kernel_storage::{
    ChangeEntry, ChangeSnapshot, ChangeTree, change_folder_seal, read_change, read_done_scope,
    refresh_done_marker, task_scope_hash,
};
use osq_kernel_sync::{SyncKind, SyncOptions, SyncOutcome, SyncRequest, SyncStop, sync_change};
use osq_kernel_vcs::{GitVcs, Vcs};

use super::steering::Trigger;
use super::worktree::record::Recorder;
use super::{failed, steered, text, worktree};
use crate::reject::time;

/// Approves `entry` in its worktree by taking the default branch into its branch.
///
/// # Errors
///
/// Returns a `Failed` error with the command `approve` when the author is unset,
/// a git or file write fails, or the sync stops, after recording that stop.
///
/// Implements: rust-approve/default-branch-approval
pub(crate) fn approve(
    root: &Path,
    entry: &ChangeEntry,
    snapshot: &ChangeSnapshot,
    triggers: &[Trigger],
    config: &Config,
    repo: &Path,
    tree: &ChangeTree,
) -> Result<String, FeatureError> {
    let worktree = tree.root.as_path();
    let author = config
        .vcs
        .author
        .as_deref()
        .ok_or_else(|| failed("vcs.author is required when vcs.enabled is true"))?;
    let default = default_branch(root, config)?;
    let vcs = GitVcs::new(worktree).with_timeouts(&config.timeouts);
    let archived = entry.location == osq_kernel_storage::Location::Archived;
    let old_relative = relative(worktree, &entry.path);
    commit_replanned(
        &vcs,
        worktree,
        &old_relative,
        &entry.folder,
        author,
        repo,
        config,
    )?;
    let folder = if archived {
        move_to_changes(worktree, &entry.path, &entry.folder)?
    } else {
        entry.path.clone()
    };
    write_specs(worktree, &folder, &vcs, &default)?;
    write_requirements_base(root, &folder, config)?;
    let seal = change_folder_seal(&folder).map_err(|error| failed(&error.to_string()))?;
    super::write_marker(&folder, seal.as_str()).map_err(|error| failed(&error.to_string()))?;
    steered::append_event(&folder, seal.as_str(), triggers)?;
    let old_relative = archived.then_some(old_relative.as_str());
    commit_approved(
        &vcs,
        worktree,
        &entry.folder,
        old_relative,
        author,
        repo,
        config,
    )?;
    let reopened = sync(worktree, &entry.folder, &default, config, &folder, snapshot)?;
    refresh_done_markers(worktree, &folder, snapshot)?;
    let after = read_change(entry).map_err(|error| failed(&error.to_string()))?;
    let continues = steered::continues_from(&after);
    Ok(text::default_branch(
        &entry.folder,
        seal.as_str(),
        worktree,
        &default,
        reopened.as_ref().map(conflict::Reopened::line).as_deref(),
        continues.as_deref(),
    ))
}

/// The default branch a `GitVcs` at the root names.
///
/// Implements: rust-approve/default-branch-approval
fn default_branch(root: &Path, config: &Config) -> Result<String, FeatureError> {
    let fallback = config.vcs.default_branch.as_deref().unwrap_or("main");
    GitVcs::new(root)
        .with_timeouts(&config.timeouts)
        .default_branch(fallback)
        .map_err(|error| failed(&error.to_string()))
}

/// Commits the uncommitted plan edits under `relative`, when there are any.
///
/// Implements: rust-approve/default-branch-approval
fn commit_replanned(
    vcs: &GitVcs,
    worktree: &Path,
    relative: &str,
    folder: &str,
    author: &str,
    repo: &Path,
    config: &Config,
) -> Result<(), FeatureError> {
    let status = vcs.status().map_err(|error| failed(&error.to_string()))?;
    if !status.iter().any(|entry| covers(relative, entry)) {
        return Ok(());
    }
    let message = format!("osq: {} replanned", worktree::text::change_id(folder));
    vcs.commit(&[relative], &message, author)
        .map_err(|error| failed(&error.to_string()))?;
    record_commit(repo, config, worktree)
}

/// Whether a status entry's path or old path lies at or under `relative`.
///
/// Implements: rust-approve/default-branch-approval
fn covers(relative: &str, entry: &osq_kernel_vcs::StatusEntry) -> bool {
    is_at_or_under(relative, &entry.path)
        || entry
            .from
            .as_deref()
            .is_some_and(|from| is_at_or_under(relative, from))
}

/// Whether `path` is `prefix` itself or sits under it.
///
/// Implements: rust-approve/default-branch-approval
fn is_at_or_under(prefix: &str, path: &str) -> bool {
    path == prefix
        || path
            .strip_prefix(prefix)
            .is_some_and(|rest| rest.starts_with('/'))
}

/// Moves an archived change folder into the worktree's changes directory.
///
/// Implements: rust-approve/default-branch-approval
fn move_to_changes(
    worktree: &Path,
    archived: &Path,
    folder: &str,
) -> Result<PathBuf, FeatureError> {
    let target = worktree.join("openspec").join("changes").join(folder);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| failed(&error.to_string()))?;
    }
    fs::rename(archived, &target).map_err(|error| failed(&error.to_string()))?;
    Ok(target)
}

/// Writes every living spec the worktree and the change own from the default branch.
///
/// Implements: rust-approve/default-branch-approval
fn write_specs(
    worktree: &Path,
    folder: &Path,
    vcs: &GitVcs,
    default: &str,
) -> Result<(), FeatureError> {
    let capabilities = capabilities(worktree, folder);
    let mut staged = Vec::new();
    for capability in capabilities {
        let relative = format!("openspec/specs/{capability}/spec.md");
        let target = worktree.join(&relative);
        let content = vcs
            .show(default, &relative)
            .map_err(|error| failed(&error.to_string()))?;
        if content.is_none() && !target.exists() {
            continue;
        }
        write_or_remove(&target, content.as_deref())?;
        staged.push(relative);
    }
    let paths: Vec<&str> = staged.iter().map(String::as_str).collect();
    vcs.stage(&paths)
        .map_err(|error| failed(&error.to_string()))
}

/// The capability folders the worktree's specs and the change's deltas name, sorted.
///
/// Implements: rust-approve/default-branch-approval
fn capabilities(worktree: &Path, folder: &Path) -> Vec<String> {
    let mut names = BTreeSet::new();
    names.extend(folder_names(&worktree.join("openspec").join("specs")));
    names.extend(folder_names(&folder.join("specs")));
    names.into_iter().collect()
}

/// The names of the folders directly under `dir`, sorted.
///
/// Implements: rust-approve/default-branch-approval
fn folder_names(dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect();
    names.sort();
    names
}

/// Writes a spec's text, or removes it when the default branch has none.
///
/// Implements: rust-approve/default-branch-approval
fn write_or_remove(target: &Path, content: Option<&str>) -> Result<(), FeatureError> {
    let Some(content) = content else {
        return fs::remove_file(target).map_err(|error| failed(&error.to_string()));
    };
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| failed(&error.to_string()))?;
    }
    fs::write(target, content).map_err(|error| failed(&error.to_string()))
}

/// Writes the root's HEAD commit, or nothing, to the change's requirements base.
///
/// Implements: rust-approve/default-branch-approval
fn write_requirements_base(
    root: &Path,
    folder: &Path,
    config: &Config,
) -> Result<(), FeatureError> {
    let head = GitVcs::new(root)
        .with_timeouts(&config.timeouts)
        .head()
        .map_err(|error| failed(&error.to_string()))?;
    let path = folder.join(".run").join("requirements-base");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| failed(&error.to_string()))?;
    }
    fs::write(&path, format!("{}\n", head.sha.unwrap_or_default()))
        .map_err(|error| failed(&error.to_string()))
}

/// Stages the moved folder and commits the approval index.
///
/// Implements: rust-approve/default-branch-approval
fn commit_approved(
    vcs: &GitVcs,
    worktree: &Path,
    folder: &str,
    old_relative: Option<&str>,
    author: &str,
    repo: &Path,
    config: &Config,
) -> Result<(), FeatureError> {
    let new_relative = format!("openspec/changes/{folder}");
    let mut paths = vec![new_relative.as_str()];
    if let Some(old_relative) = old_relative {
        paths.push(old_relative);
    }
    vcs.stage(&paths)
        .map_err(|error| failed(&error.to_string()))?;
    let message = format!("osq: {} approved", worktree::text::change_id(folder));
    vcs.commit(&[], &message, author)
        .map_err(|error| failed(&error.to_string()))?;
    record_commit(repo, config, worktree)
}

/// Runs the sync of step 9, recording a sync commit or the stop it gives.
///
/// Implements: rust-approve/default-branch-approval
/// Implements: rust-approve/conflict-reopen
fn sync(
    worktree: &Path,
    folder: &str,
    default: &str,
    config: &Config,
    change: &Path,
    snapshot: &ChangeSnapshot,
) -> Result<Option<conflict::Reopened>, FeatureError> {
    let request = SyncRequest {
        worktree,
        folder,
        kind: SyncKind::Active,
        default_branch: default,
        settings: &config.vcs,
        timeouts: &config.timeouts,
        limits: &config.limits,
        options: SyncOptions {
            records: false,
            verify: false,
            tasks: None,
        },
    };
    match sync_change(&request) {
        Ok(SyncOutcome::AlreadySynced) => Ok(None),
        Ok(SyncOutcome::Synced { .. }) => {
            record_commit(worktree, config, worktree)?;
            Ok(None)
        }
        Err(stop) if stop.reason == SyncStopReason::SyncConflict => {
            conflict::handle(change, folder, default, &request, &stop, snapshot, config).map(Some)
        }
        Err(stop) => Err(record_stop(change, snapshot, &stop)),
    }
}

/// Records an approval stop and gives the error `approve` fails with.
///
/// Implements: rust-approve/default-branch-approval
fn record_stop(change: &Path, snapshot: &ChangeSnapshot, stop: &SyncStop) -> FeatureError {
    let reason = marker_reason(snapshot, stop.reason);
    if let Err(error) = write_regressed(change, &reason, &stop.message) {
        return error;
    }
    if let Err(error) = append_regressed_event(change, stop.reason, &stop.message) {
        return error;
    }
    failed(&stop.message)
}

/// The marker reason a stop records: its own, but a `sync_failed` keeps the old one.
///
/// Implements: rust-approve/default-branch-approval
fn marker_reason(snapshot: &ChangeSnapshot, reason: SyncStopReason) -> String {
    if reason != SyncStopReason::SyncFailed {
        return reason.as_str().to_owned();
    }
    snapshot.change_regressed.as_ref().map_or_else(
        || reason.as_str().to_owned(),
        |marker| marker.reason.clone(),
    )
}

/// Writes `.run/regressed/change.md` for the stop.
///
/// Implements: rust-approve/default-branch-approval
fn write_regressed(change: &Path, reason: &str, message: &str) -> Result<(), FeatureError> {
    let path = change.join(".run").join("regressed").join("change.md");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| failed(&error.to_string()))?;
    }
    fs::write(&path, format!("---\nreason: {reason}\n---\n{message}\n"))
        .map_err(|error| failed(&error.to_string()))
}

/// Appends the stop's `regressed` event.
///
/// Implements: rust-approve/default-branch-approval
fn append_regressed_event(
    change: &Path,
    reason: SyncStopReason,
    message: &str,
) -> Result<(), FeatureError> {
    let path = change.join(".run").join("events").join("change.jsonl");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| failed(&error.to_string()))?;
    }
    let envelope = Envelope {
        timestamp: time::now(),
        event: Event::Regressed(RegressedData {
            task: Some("change".to_owned()),
            exit_code: None,
            duration: None,
            command: None,
            differing_paths: None,
            missing_paths: None,
            reason: Some(regression(reason)),
            attribution: None,
            recorded_hash: None,
            current_hash: None,
            recorded_resolver: None,
            current_resolver: None,
            output: Some(message.to_owned()),
            timed_out: None,
            verification_passed: None,
        }),
    };
    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(&path)
        .map_err(|error| failed(&error.to_string()))?;
    file.write_all(format!("{}\n", event_line(&envelope)).as_bytes())
        .map_err(|error| failed(&error.to_string()))
}

/// The regression reason that carries a sync stop reason.
///
/// Implements: rust-approve/default-branch-approval
fn regression(reason: SyncStopReason) -> RegressionReason {
    match reason {
        SyncStopReason::SyncConflict => RegressionReason::SyncConflict,
        SyncStopReason::RequirementChanged => RegressionReason::RequirementChanged,
        SyncStopReason::SyncVerifyRed => RegressionReason::SyncVerifyRed,
        SyncStopReason::SyncFailed => RegressionReason::SyncFailed,
    }
}

/// Recertifies every done marker whose scope hash differs on the merged tree.
///
/// Implements: rust-approve/default-branch-approval
fn refresh_done_markers(
    worktree: &Path,
    folder: &Path,
    snapshot: &ChangeSnapshot,
) -> Result<(), FeatureError> {
    for task in &snapshot.tasks {
        let id = task.id.as_str();
        if !task.done || !id.bytes().all(|byte| byte.is_ascii_digit()) {
            continue;
        }
        if !folder.join("tasks").join(format!("{id}.md")).is_file() {
            continue;
        }
        let Some(recorded) = read_done_scope(folder, id) else {
            continue;
        };
        let current = task_scope_hash(worktree, &task.plan.scope);
        if current.hash == recorded.scope_hash {
            continue;
        }
        refresh_done_marker(folder, id, &recorded.scope_hash, &current, &time::now())
            .map_err(|error| failed(&error.to_string()))?;
    }
    Ok(())
}

/// Records one `commit` line for `root`, ignoring a failed record.
///
/// Implements: rust-approve/default-branch-approval
fn record_commit(repo: &Path, config: &Config, root: &Path) -> Result<(), FeatureError> {
    let recorder = Recorder::new(repo, &config.timeouts).map_err(|error| failed(&error))?;
    recorder.record("commit", root);
    Ok(())
}

/// A path relative to `base`, with POSIX separators.
///
/// Implements: rust-approve/default-branch-approval
fn relative(base: &Path, path: &Path) -> String {
    path.strip_prefix(base)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}
