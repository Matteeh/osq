//! The task's result, blocked check, two verifies and their dead markers.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::time::Duration;

use osq_core::FeatureError;
use osq_core::event::DeadReason;
use osq_kernel_config::Config;
use osq_kernel_harnesses::{VerifyOutcome, VerifyRequest, run_verify};
use osq_kernel_specs::{TaskFile, read_proposal};
use osq_kernel_storage::{ChangeEntry, parse_result_sections};

use super::{dead, events};

/// The most output bytes a dead marker's body keeps.
const OUTPUT_TAIL_BYTES: usize = 2000;

/// Judges a task that wrote a result file: blocked, then both verifies.
///
/// # Errors
///
/// Returns a `Failed` error after recording the task's death for a missing
/// result, a real blocked section, and either red verify.
///
/// Implements: rust-run/run-verdict
pub(crate) fn judge(
    root: &Path,
    entry: &ChangeEntry,
    task: &str,
    task_file: &TaskFile,
    config: &Config,
) -> Result<(), FeatureError> {
    let result_path = entry
        .path
        .join(".run")
        .join("results")
        .join(format!("{task}.md"));
    let Ok(text) = fs::read_to_string(&result_path) else {
        let marker = format!(
            "---\nreason: no_result\n---\nAgent exited without writing result file at .run/results/{task}.md and produced no final text.\n"
        );
        return dead::kill(
            &entry.path,
            &entry.folder,
            task,
            DeadReason::NoResult,
            &marker,
        );
    };
    if let Some(blocked) = parse_result_sections(&text).blocked {
        let marker = format!("---\nreason: blocked\n---\n{blocked}\n");
        return dead::kill(
            &entry.path,
            &entry.folder,
            task,
            DeadReason::Blocked,
            &marker,
        );
    }
    let task_verify = verify(
        root,
        entry,
        config,
        &task_file.verify,
        config.timeouts.task_timeout,
        &format!("{task}.jsonl"),
        Some(task),
    )?;
    if failed(&task_verify) {
        let marker = task_marker(&task_file.verify, &task_verify);
        return dead::kill(
            &entry.path,
            &entry.folder,
            task,
            DeadReason::VerifyRed,
            &marker,
        );
    }
    let proposal = read_proposal(&entry.path.join("proposal.md"))
        .map_err(|error| failed_error(error.to_string()))?;
    let change_verify = verify(
        root,
        entry,
        config,
        &proposal.verify,
        config.timeouts.verify_timeout,
        "change.jsonl",
        None,
    )?;
    if failed(&change_verify) {
        let marker = change_marker(&proposal.verify, &change_verify);
        return dead::kill(
            &entry.path,
            &entry.folder,
            task,
            DeadReason::ChangeVerifyRed,
            &marker,
        );
    }
    Ok(())
}

/// Runs one verify command and appends its `verify_ran` event.
///
/// The task's verify goes to the task's stream; the proposal's goes to
/// `change.jsonl`, as TypeScript records them.
fn verify(
    root: &Path,
    entry: &ChangeEntry,
    config: &Config,
    command: &str,
    timeout: Duration,
    stream: &str,
    task: Option<&str>,
) -> Result<VerifyOutcome, FeatureError> {
    let request = VerifyRequest {
        command: command.to_owned(),
        cwd: root.to_path_buf(),
        source_env: std::env::vars().collect::<BTreeMap<_, _>>(),
        configured_env: Vec::new(),
        agent_env: Vec::new(),
        change: Some(relative(root, &entry.path)),
        diff: std::env::var("OSQ_DIFF").ok(),
        extra_env: BTreeMap::new(),
        timeout: Some(timeout),
        kill_grace: config.timeouts.harness_kill_grace,
    };
    let outcome = run_verify(&request).map_err(|error| failed_error(error.to_string()))?;
    events::verify_ran(&entry.path, stream, task, command, &outcome)?;
    Ok(outcome)
}

/// Whether one verify outcome is red, by exit or by timeout.
fn failed(outcome: &VerifyOutcome) -> bool {
    outcome.timed_out || outcome.exit_code != 0
}

/// The task verify's dead marker, with its command and output tail.
fn task_marker(command: &str, outcome: &VerifyOutcome) -> String {
    if outcome.timed_out {
        format!(
            "---\nreason: verify_red\ntimed_out: true\ncommand: \"{command}\"\n---\nWatcher independent verify timed out:\n{}\n",
            tail(&outcome.output)
        )
    } else {
        format!(
            "---\nreason: verify_red\ncommand: \"{command}\"\n---\nWatcher independent verify failed:\n{}\n",
            tail(&outcome.output)
        )
    }
}

/// The proposal verify's dead marker, with its command and output tail.
fn change_marker(command: &str, outcome: &VerifyOutcome) -> String {
    let timed_out = if outcome.timed_out {
        "timed_out: true\n"
    } else {
        ""
    };
    let result = if outcome.timed_out {
        "timed out"
    } else {
        "failed"
    };
    format!(
        "---\nreason: change_verify_red\n{timed_out}command: \"{command}\"\nexit_code: {}\n---\nChange-level verification {result} after task verification passed.\n{}\n",
        outcome.exit_code,
        tail(&outcome.output)
    )
}

/// The last 2000 bytes of an output, cut on a character boundary.
fn tail(output: &str) -> &str {
    let mut start = output.len().saturating_sub(OUTPUT_TAIL_BYTES);
    for _ in 0..3 {
        if output.is_char_boundary(start) {
            break;
        }
        start += 1;
    }
    &output[start..]
}

/// Gives one path relative to the root as a POSIX path.
fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Builds the failed error for a verify step.
fn failed_error(message: String) -> FeatureError {
    FeatureError::failed("run", message)
}
