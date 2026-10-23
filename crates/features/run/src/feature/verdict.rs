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

use super::{dead, events, log, output};

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
    death: &dead::Death<'_>,
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
            death,
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
            death,
        );
    }
    let (task_verify, task_log) = verify(
        root,
        entry,
        config,
        &task_file.verify,
        config.timeouts.task_timeout,
        task,
        Some(task),
    )?;
    if failed(&task_verify) {
        let marker = task_marker(&task_file.verify, &task_verify, &task_log, config);
        return dead::kill(
            &entry.path,
            &entry.folder,
            task,
            DeadReason::VerifyRed,
            &marker,
            death,
        );
    }
    let proposal = read_proposal(&entry.path.join("proposal.md"))
        .map_err(|error| failed_error(error.to_string()))?;
    let (change_verify, change_log) = verify(
        root,
        entry,
        config,
        &proposal.verify,
        config.timeouts.verify_timeout,
        "change",
        None,
    )?;
    if failed(&change_verify) {
        let marker = change_marker(&proposal.verify, &change_verify, &change_log, config);
        return dead::kill(
            &entry.path,
            &entry.folder,
            task,
            DeadReason::ChangeVerifyRed,
            &marker,
            death,
        );
    }
    Ok(())
}

/// Runs one verify command, writes its log and appends its `verify_ran` event.
///
/// The task's verify goes to the task's stream; the proposal's goes to
/// `change.jsonl`, as TypeScript records them.
fn verify(
    root: &Path,
    entry: &ChangeEntry,
    config: &Config,
    command: &str,
    timeout: Duration,
    target: &str,
    task: Option<&str>,
) -> Result<(VerifyOutcome, String), FeatureError> {
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
    let log = log::write_log(&entry.path, target, &outcome.output)?;
    let stream = task.map_or_else(|| "change.jsonl".to_owned(), |task| format!("{task}.jsonl"));
    events::verify_ran(&entry.path, &stream, task, command, &outcome, &log, config)?;
    Ok((outcome, log))
}

/// Whether one verify outcome is red, by exit or by timeout.
fn failed(outcome: &VerifyOutcome) -> bool {
    outcome.timed_out || outcome.exit_code != 0
}

/// The task verify's dead marker, with its command and output excerpt.
fn task_marker(command: &str, outcome: &VerifyOutcome, log: &str, config: &Config) -> String {
    if outcome.timed_out {
        let excerpt = excerpt(&outcome.output, log, config);
        format!(
            "---\nreason: verify_red\ntimed_out: true\ncommand: \"{command}\"\n---\nWatcher independent verify timed out:\n{excerpt}\n"
        )
    } else {
        let output = if outcome.output.is_empty() {
            format!("Process exited with code {}", outcome.exit_code)
        } else {
            outcome.output.clone()
        };
        let excerpt = excerpt(&output, log, config);
        format!(
            "---\nreason: verify_red\ncommand: \"{command}\"\n---\nWatcher independent verify failed:\n{excerpt}\n"
        )
    }
}

/// The proposal verify's dead marker, with its command and output excerpt.
fn change_marker(command: &str, outcome: &VerifyOutcome, log: &str, config: &Config) -> String {
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
    let excerpt = excerpt(&outcome.output, log, config);
    format!(
        "---\nreason: change_verify_red\n{timed_out}command: \"{command}\"\nexit_code: {}\n---\nChange-level verification {result} after task verification passed.\n{excerpt}\n",
        outcome.exit_code
    )
}

/// The excerpt of one output, sized by the config's marker limits.
fn excerpt(output: &str, log: &str, config: &Config) -> String {
    output::excerpt_verify_output(
        output,
        log,
        config.limits.marker_output_lines,
        config.limits.marker_line_chars,
    )
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
