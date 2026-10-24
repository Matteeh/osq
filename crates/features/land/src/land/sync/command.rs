//! Running one sync command through the verify runner.

use std::collections::BTreeMap;
use std::path::Path;
use std::time::Duration;

use osq_kernel_config::Timeouts;
use osq_kernel_harnesses::{VerifyRequest, run_verify};

/// Runs `command` in `cwd`, giving its exit code and output.
///
/// A start error counts as exit code 1 with its display as the output.
///
/// Implements: rust-land/land-sync
pub(crate) fn run(cwd: &Path, command: &str, timeouts: &Timeouts) -> (i32, String) {
    let (exit_code, output, _) = run_timed(cwd, command, timeouts);
    (exit_code, output)
}

/// Runs `command` in `cwd`, giving its exit code, output and duration.
///
/// A start error counts as exit code 1 with its display as the output and no
/// duration.
///
/// Implements: rust-land/land-sync-verify
pub(crate) fn run_timed(cwd: &Path, command: &str, timeouts: &Timeouts) -> (i32, String, Duration) {
    run_timed_with(cwd, command, timeouts, None)
}

/// Runs `command` in `cwd` with a change folder set, giving its run.
///
/// A start error counts as exit code 1 with its display as the output and no
/// duration.
///
/// Implements: rust-land/active-sync-verify
pub(crate) fn run_timed_with(
    cwd: &Path,
    command: &str,
    timeouts: &Timeouts,
    change: Option<String>,
) -> (i32, String, Duration) {
    let request = VerifyRequest {
        command: command.to_owned(),
        cwd: cwd.to_path_buf(),
        source_env: std::env::vars().collect::<BTreeMap<_, _>>(),
        configured_env: Vec::new(),
        agent_env: Vec::new(),
        change,
        diff: None,
        extra_env: BTreeMap::new(),
        timeout: Some(timeouts.verify_timeout),
        kill_grace: timeouts.harness_kill_grace,
    };
    match run_verify(&request) {
        Ok(outcome) => (outcome.exit_code, outcome.output, outcome.duration),
        Err(error) => (1, error.to_string(), Duration::ZERO),
    }
}
