//! Running one task: the refusals, the lock, the approval check and the end.

use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_core::event::DeadReason;
use osq_kernel_config::Config;
use osq_kernel_specs::read_task_file;
use osq_kernel_storage::{ChangeEntry, change_folder_seal};

use super::{dead, done, lock, refusals, scope, start, text, verdict};
use crate::prompt::{PriorAttempt, executor_prompt};

/// Runs one task of an active change once.
///
/// # Errors
///
/// Returns a `Failed` error with the command `run` for every refusal the run
/// requirements name, for a lock another run holds, and for a task that dies.
///
/// Implements: rust-run/run-refusals
/// Implements: rust-run/run-lock
/// Implements: rust-run/run-approval-check
/// Implements: rust-run/dead-record
pub(crate) fn run_one(root: &Path, id: &str, task: &str) -> Result<String, FeatureError> {
    let (entry, config) = refusals::check(root, id, task)?;
    if !lock::acquire(&entry.path, task)? {
        return Err(failed(text::already_running(task, &entry.folder)));
    }
    let outcome = after_lock(root, &entry, task, &config);
    lock::release(&entry.path, task);
    outcome
}

/// Runs everything that happens while the task's lock is held.
///
/// # Errors
///
/// Returns a `Failed` error for an approval conflict, a start failure, a scope
/// violation and every death the verdict records.
///
/// Implements: rust-run/executor-start
/// Implements: rust-run/run-scope-audit
/// Implements: rust-run/run-verdict
/// Implements: rust-run/done-record
fn after_lock(
    root: &Path,
    entry: &ChangeEntry,
    task: &str,
    config: &Config,
) -> Result<String, FeatureError> {
    check_approval(entry, task)?;
    let task_file = read_task_file(&entry.path.join("tasks").join(format!("{task}.md")))
        .map_err(|error| failed(error.to_string()))?;
    let before = scope::snapshot(root)?;
    let prompt = executor_prompt(root, &entry.path, task, &PriorAttempt::default())
        .map_err(|error| failed(error.to_string()))?;
    let started = start::run(root, &entry.path, &entry.folder, task, config, &prompt)?;
    let after = scope::snapshot(root)?;
    let wrote_result = result_written(entry, task, started.started_ms);
    if let Some(exit) = started.exit {
        if exit.timed_out || exit.code != 0 {
            if !wrote_result {
                let reason = if exit.timed_out {
                    DeadReason::Timeout
                } else {
                    DeadReason::Crashed
                };
                let marker = format!(
                    "---\nreason: {}\n---\nTask execution ended abnormally (exit code {}).\n",
                    reason.as_str(),
                    exit.code
                );
                return dead::kill(&entry.path, &entry.folder, task, reason, &marker);
            }
            start::exit_continued(&entry.path, task, exit.code)?;
        }
    } else if !wrote_result {
        return Err(failed(text::cannot_start(task, &entry.folder)));
    }
    let changes = scope::changed(&before, &after);
    scope::audit(root, entry, task, &task_file, changes)?;
    verdict::judge(root, entry, task, &task_file, config)?;
    done::record(entry, task)?;
    Ok(text::done(task, &entry.folder))
}

/// Whether the result file was written at or after the start, within one second.
fn result_written(entry: &ChangeEntry, task: &str, started_ms: i64) -> bool {
    let path = entry
        .path
        .join(".run")
        .join("results")
        .join(format!("{task}.md"));
    let Ok(modified) = fs::metadata(path).and_then(|metadata| metadata.modified()) else {
        return false;
    };
    let Ok(elapsed) = modified.duration_since(std::time::UNIX_EPOCH) else {
        return false;
    };
    i64::try_from(elapsed.as_millis()).is_ok_and(|millis| millis >= started_ms.saturating_sub(1000))
}

/// Compares the trimmed approval marker with the change folder's seal.
///
/// # Errors
///
/// Returns a `Failed` error after recording a `spec_conflict` death when the
/// marker is missing or names another seal, and when the folder cannot be
/// sealed.
///
/// Implements: rust-run/run-approval-check
/// Implements: rust-run/dead-record
fn check_approval(entry: &ChangeEntry, task: &str) -> Result<(), FeatureError> {
    let path = entry.path.join(".run").join("approved");
    let approved = fs::read_to_string(&path)
        .ok()
        .map(|text| text.trim().to_owned());
    let Some(approved) = approved else {
        return die(entry, task, &text::missing_approval());
    };
    let computed = change_folder_seal(&entry.path).map_err(|error| failed(error.to_string()))?;
    let current = computed.as_str();
    if approved == current {
        return Ok(());
    }
    die(entry, task, &text::changed_approval(&approved, current))
}

/// Records a `spec_conflict` death and returns the failed ending.
fn die(entry: &ChangeEntry, task: &str, marker: &str) -> Result<(), FeatureError> {
    dead::kill(
        &entry.path,
        &entry.folder,
        task,
        DeadReason::SpecConflict,
        marker,
    )
}

/// Builds the failed error for a run step.
fn failed(message: String) -> FeatureError {
    FeatureError::failed("run", message)
}
