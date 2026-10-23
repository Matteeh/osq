//! The task verify that runs once before a task's first attempt.

use std::path::Path;

use osq_core::FeatureError;
use osq_core::event::DeadReason;
use osq_kernel_config::Config;
use osq_kernel_harnesses::VerifyOutcome;
use osq_kernel_specs::{TaskFile, VerifyStarts};
use osq_kernel_storage::ChangeEntry;

use super::{dead, named, verdict};

/// The pre-spawn fields a verify's event and mismatch carry.
pub(crate) struct PreSpawn<'a> {
    /// The declared start the task names.
    pub(crate) expected: VerifyStarts,
    /// The named paths the tree lacks.
    pub(crate) missing: &'a [String],
}

/// The declared start as its event and marker spell it.
///
/// Implements: rust-run/pre-spawn-verify
pub(crate) fn start_name(start: VerifyStarts) -> &'static str {
    match start {
        VerifyStarts::Red => "red",
        VerifyStarts::Green => "green",
        VerifyStarts::Any => "any",
    }
}

/// Whether a first attempt's declared start disagrees with the observed result.
///
/// A red start that passes only because a named path is absent is no mismatch:
/// the honest red start has not been observed yet.
///
/// Implements: rust-run/pre-spawn-verify
pub(crate) fn mismatch(
    expected: VerifyStarts,
    outcome: &VerifyOutcome,
    missing: &[String],
) -> bool {
    let passed = outcome.exit_code == 0 && !outcome.timed_out;
    match expected {
        VerifyStarts::Red => passed && missing.is_empty(),
        VerifyStarts::Green => !passed,
        VerifyStarts::Any => false,
    }
}

/// Runs a task's verify once before its first attempt and kills a mismatch.
///
/// # Errors
///
/// Returns a `Failed` error when the verify cannot run or when the mismatch's
/// dead record cannot be written, and the death's own ending otherwise.
///
/// Implements: rust-run/pre-spawn-verify
pub(crate) fn run(
    root: &Path,
    entry: &ChangeEntry,
    task: &str,
    task_file: &TaskFile,
    config: &Config,
    death: &dead::Death<'_>,
) -> Result<(), FeatureError> {
    let expected = task_file.verify_starts;
    let missing = named::missing(root, &task_file.verify);
    let pre_spawn = PreSpawn {
        expected,
        missing: &missing,
    };
    let (outcome, log) = verdict::verify(
        root,
        entry,
        config,
        &task_file.verify,
        config.timeouts.task_timeout,
        verdict::VerifyStream::Task(task),
        Some(&pre_spawn),
    )?;
    if !mismatch(expected, &outcome, &missing) {
        return Ok(());
    }
    let marker = marker(&task_file.verify, expected, &outcome, &log, config);
    dead::kill(
        &entry.path,
        &entry.folder,
        task,
        DeadReason::VerifyPrecondition,
        &marker,
        death,
    )
}

/// The dead marker for a pre-spawn mismatch.
///
/// Implements: rust-run/pre-spawn-verify
fn marker(
    command: &str,
    expected: VerifyStarts,
    outcome: &VerifyOutcome,
    log: &str,
    config: &Config,
) -> String {
    let start = start_name(expected);
    let excerpt = verdict::excerpt(&outcome.output, log, config);
    format!(
        "---\nreason: verify_precondition\ncommand: \"{command}\"\nexpected: {start}\nexit_code: {}\n---\nPre-spawn verify precondition not met (expected {start}, exit code {}):\n{excerpt}\n",
        outcome.exit_code, outcome.exit_code
    )
}
