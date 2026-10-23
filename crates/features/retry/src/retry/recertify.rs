//! Rerunning a scope regressed task's verify without an agent.

mod done;
mod fields;

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_core::event::{Event, RecertificationData, RecertificationOutcome, RequeueReason};
use osq_kernel_config::load_config;
use osq_kernel_harnesses::{VerifyRequest, run_verify};
use osq_kernel_specs::read_task_file;

use super::marker::{Failure, Recertified};
use super::record::{self, Recorded};
use super::time::{format_utc, now_ms};
use super::{excerpt, scope, text};

/// Reads the task, runs its verify, then recertifies or requeues it.
///
/// # Errors
///
/// Returns a `Failed` error with the command `retry` for a task file or config
/// that cannot be read, a verify that cannot start, or a marker or event that
/// cannot be written.
///
/// Implements: rust-retry/scope-recertification
pub(crate) fn run(
    root: &Path,
    tree_root: &Path,
    folder: &Path,
    id: &str,
    task: &str,
    failure: &Failure,
    recertified: &Recertified,
) -> Result<Recorded, FeatureError> {
    let task_file = read_task_file(&folder.join("tasks").join(format!("{task}.md")))
        .map_err(|error| text::failed(error.to_string()))?;
    let config = load_config(root).map_err(|error| text::failed(error.to_string()))?;
    let request = VerifyRequest {
        command: task_file.verify.clone(),
        cwd: tree_root.to_path_buf(),
        source_env: std::env::vars().collect::<BTreeMap<_, _>>(),
        configured_env: Vec::new(),
        agent_env: Vec::new(),
        change: Some(absolute(folder)),
        diff: None,
        extra_env: BTreeMap::new(),
        timeout: Some(config.timeouts.verify_timeout),
        kill_grace: config.timeouts.harness_kill_grace,
    };
    let outcome = run_verify(&request).map_err(|error| text::failed(error.to_string()))?;
    let current = scope::compute_hash(tree_root, &task_file.scope);
    let passed = outcome.exit_code == 0;
    let now = format_utc(now_ms());
    if passed {
        done::rewrite(folder, task, &recertified.recorded_hash, &current, &now)?;
    }
    let marker = fs::read_to_string(folder.join(".run/regressed").join(format!("{task}.md")))
        .map_err(|error| text::failed(format!("cannot read the regressed marker: {error}")))?;
    let facts = fields::facts(&marker);
    let retained = retain(folder, task, failure.ordinal, passed)?;
    let output = excerpt::tail_verify_output(
        &outcome.output,
        config.limits.marker_output_lines,
        config.limits.marker_line_chars,
    );
    let event = RecertificationData {
        task: task.to_owned(),
        outcome: if passed {
            RecertificationOutcome::Passed
        } else {
            RecertificationOutcome::Requeued
        },
        differing_paths: facts.differing_paths,
        attribution: facts.attribution,
        command: task_file.verify,
        exit_code: i64::from(outcome.exit_code),
        output: Some(output),
        timed_out: outcome.timed_out,
        recorded_hash: recertified.recorded_hash.clone(),
        current_hash: current.hash,
        attempt: (!passed).then_some(failure.ordinal + 1),
        reason: (!passed).then_some(RequeueReason::ScopeRegression),
        automatic: None,
    };
    record::append_line(folder, task, Event::Recertification(event))?;
    let text = if passed {
        text::recertified(id, task, &retained)
    } else {
        text::requeued(id, task, failure.ordinal + 1, &retained)
    };
    Ok(Recorded { text, retained })
}

/// Retains the regressed marker and, when requeued, the done marker.
///
/// # Errors
///
/// Returns a `Failed` error with the command `retry` when a marker cannot be
/// renamed.
///
/// Implements: rust-retry/scope-recertification
fn retain(
    folder: &Path,
    task: &str,
    ordinal: u64,
    passed: bool,
) -> Result<Vec<String>, FeatureError> {
    let run = folder.join(".run");
    let mut retained = Vec::new();
    record::retain(
        &run.join("regressed").join(format!("{task}.md")),
        &run.join("regressed").join(format!("{task}.{ordinal}.md")),
        folder,
        &mut retained,
    )?;
    if !passed {
        let done_path = run.join("done").join(task);
        if done_path.exists() {
            record::retain(
                &done_path,
                &run.join("done").join(format!("{task}.{ordinal}")),
                folder,
                &mut retained,
            )?;
        }
    }
    Ok(retained)
}

/// The change folder as an absolute path for `OSQ_CHANGE`.
///
/// Implements: rust-retry/scope-recertification
fn absolute(folder: &Path) -> String {
    folder
        .canonicalize()
        .unwrap_or_else(|_| folder.to_path_buf())
        .to_string_lossy()
        .into_owned()
}
