//! Catching a worktree change up after a `commit_failed` halt.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_core::event::{
    DeadReason, Event, FailureReason, RegressionReason, RetryData, parse_event_line,
};
use osq_kernel_config::Config;
use osq_kernel_specs::parse_frontmatter;
use osq_kernel_storage::ChangeEntry;
use osq_kernel_vcs::{GitVcs, StatusEntry, Vcs};

use super::{commit, events, halt, scope, text};

/// The target and reason a caught-up halt clears.
const CHANGE: &str = "change";

/// The reason text rust-retry gives a marker without one.
const REGRESSED: &str = "regressed";

/// Commits a halted change's pending dead tasks and clears a `commit_failed`
/// halt within `gates.commitRetries`.
///
/// # Errors
///
/// Returns a `Failed` error with the command `run` when another halt or a spent
/// budget refuses the change, and when committing a pending dead task fails.
///
/// Implements: rust-run/commit-catch-up
pub(crate) fn run(root: &Path, entry: &ChangeEntry, config: &Config) -> Result<(), FeatureError> {
    let marker = entry.path.join(".run").join("regressed").join("change.md");
    if !marker.exists() {
        return Ok(());
    }
    let content = fs::read_to_string(&marker).map_err(|error| failed(&marker, &error))?;
    let reason = marker_reason(&content);
    if reason != RegressionReason::CommitFailed.as_str() {
        return Err(failed_text(refusal(&entry.folder, &reason)));
    }
    if commit_failed_count(&entry.path) > config.gates.commit_retries {
        return Err(failed_text(refusal(&entry.folder, &reason)));
    }
    commit_pending(root, entry, config)?;
    clear(entry)
}

/// Commits each pending dead task with its marker's reason, keeping its patch.
///
/// # Errors
///
/// Returns a `Failed` error after recording a new `commit_failed` halt when a
/// dead commit fails.
///
/// Implements: rust-run/commit-catch-up
fn commit_pending(root: &Path, entry: &ChangeEntry, config: &Config) -> Result<(), FeatureError> {
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let status = vcs
        .status()
        .map_err(|error| failed_text(error.to_string()))?;
    let change = scope::relative(root, &entry.path);
    for task in pending_dead(&status, &change) {
        let reason = dead_reason(&entry.path, &task);
        if let Err(error) = commit::dead_with(root, &entry.path, &task, &reason, config, true) {
            halt::record(&entry.path, RegressionReason::CommitFailed, &error, config)?;
            return Err(failed_text(text::commit_failed_dead(
                &task,
                &entry.folder,
                &reason,
                error,
            )));
        }
    }
    Ok(())
}

/// Renames the active halt marker and appends the automatic `retry` event.
///
/// # Errors
///
/// Returns a `Failed` error when the marker cannot be renamed or the event
/// cannot be written.
///
/// Implements: rust-run/commit-catch-up
fn clear(entry: &ChangeEntry) -> Result<(), FeatureError> {
    let run = entry.path.join(".run");
    let dead = entries(&run.join("dead"));
    let regressed = entries(&run.join("regressed"));
    let ordinal = retained_ordinal(&dead, CHANGE).max(retained_ordinal(&regressed, CHANGE)) + 1;
    let from = run.join("regressed").join(format!("{CHANGE}.md"));
    let to = run.join("regressed").join(format!("{CHANGE}.{ordinal}.md"));
    fs::rename(&from, &to).map_err(|error| {
        failed_text(format!(
            "cannot rename {} to {}: {error}",
            from.display(),
            to.display()
        ))
    })?;
    events::append(
        &entry.path,
        &format!("{CHANGE}.jsonl"),
        Event::Retry(RetryData {
            target: CHANGE.to_owned(),
            reason: FailureReason::CommitFailed,
            attempt: ordinal + 1,
            automatic: Some(true),
        }),
    )
}

/// The frontmatter reason of a halt marker, or rust-retry's fallback.
///
/// Implements: rust-run/commit-catch-up
fn marker_reason(content: &str) -> String {
    frontmatter_text(content, "reason")
        .map(|reason| reason.trim().to_owned())
        .filter(|reason| !reason.is_empty())
        .unwrap_or_else(|| REGRESSED.to_owned())
}

/// A dead marker's reason, or `no_result` without one.
///
/// Implements: rust-run/commit-catch-up
fn dead_reason(folder: &Path, task: &str) -> String {
    let path = folder.join(".run").join("dead").join(format!("{task}.md"));
    let content = fs::read_to_string(path).unwrap_or_default();
    frontmatter_text(&content, "reason")
        .map(|reason| reason.trim().to_owned())
        .filter(|reason| !reason.is_empty())
        .unwrap_or_else(|| DeadReason::NoResult.as_str().to_owned())
}

/// A string frontmatter field, or none without one that parses.
///
/// Implements: rust-run/commit-catch-up
fn frontmatter_text(content: &str, key: &str) -> Option<String> {
    let frontmatter = parse_frontmatter(content).ok()?;
    frontmatter
        .data
        .iter()
        .find(|(name, _)| name.as_str() == Some(key))
        .and_then(|(_, value)| value.as_str())
        .map(str::to_owned)
}

/// How many `commit_failed` regressed events follow the last human retry.
///
/// Implements: rust-run/commit-catch-up
fn commit_failed_count(folder: &Path) -> u64 {
    let path = folder.join(".run").join("events").join("change.jsonl");
    let Ok(content) = fs::read_to_string(path) else {
        return 0;
    };
    let mut count = 0;
    for line in content.lines() {
        let Ok(envelope) = parse_event_line(line.trim()) else {
            continue;
        };
        match envelope.event {
            Event::Retry(data) if data.target == CHANGE && data.automatic.is_none() => count = 0,
            Event::Regressed(data) if data.reason == Some(RegressionReason::CommitFailed) => {
                count += 1;
            }
            _ => {}
        }
    }
    count
}

/// The pending dead marker tasks status lists as untracked or added.
///
/// Implements: rust-run/commit-catch-up
fn pending_dead(status: &[StatusEntry], change: &str) -> Vec<String> {
    let prefix = format!("{change}/.run/dead/");
    let mut tasks = BTreeSet::new();
    for entry in status {
        if entry.code != "??" && !entry.code.starts_with('A') {
            continue;
        }
        let Some(name) = entry.path.strip_prefix(&prefix) else {
            continue;
        };
        let Some(task) = name.strip_suffix(".md") else {
            continue;
        };
        if !task.is_empty() && task.bytes().all(|byte| byte.is_ascii_digit()) {
            tasks.insert(task.to_owned());
        }
    }
    let mut tasks: Vec<String> = tasks.into_iter().collect();
    tasks.sort_by_key(|task| task.parse::<u128>().unwrap_or(u128::MAX));
    tasks
}

/// The names directly under `dir`, or none without the folder.
///
/// Implements: rust-run/commit-catch-up
fn entries(dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect()
}

/// The highest `n` of `<target>.<n>.md` among `entries`, or zero.
///
/// Implements: rust-run/commit-catch-up
fn retained_ordinal(entries: &[String], target: &str) -> u64 {
    let prefix = format!("{target}.");
    entries
        .iter()
        .filter_map(|name| name.strip_prefix(&prefix))
        .filter_map(|rest| rest.strip_suffix(".md"))
        .filter(|digits| digits.bytes().all(|byte| byte.is_ascii_digit()))
        .filter_map(|digits| digits.parse().ok())
        .max()
        .unwrap_or(0)
}

/// The refusal for a halt the catch-up may not clear.
///
/// Implements: rust-run/commit-catch-up
fn refusal(folder: &str, reason: &str) -> String {
    let digits: String = folder.chars().take_while(char::is_ascii_digit).collect();
    let id = if digits.is_empty() { folder } else { &digits };
    format!("Change {folder} is halted ({reason}); run osq retry {id} change")
}

/// Builds the failed error for a catch-up that could not be made.
///
/// Implements: rust-run/commit-catch-up
fn failed_text(message: String) -> FeatureError {
    FeatureError::failed("run", message)
}

/// Builds the failed error for a path that could not be read.
///
/// Implements: rust-run/commit-catch-up
fn failed(path: &Path, error: &std::io::Error) -> FeatureError {
    failed_text(format!("cannot read {}: {error}", path.display()))
}
