//! Running one verify command as osq's verify role, with a bounded lifetime.
//!
//! The runner gives the command only the verify role's environment, the change
//! and diff variables, and the caller's extras. It captures stdout and stderr
//! together and rewrites the command's folder to project-relative paths.
//! ADR 007 keeps the model key out of verify, and ADR 023 keeps the path
//! rewrite and the outcome mapping pure.

mod env;
mod output;
mod runner;

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use crate::ProcessError;

/// Everything the verify runner needs to run one command.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifyRequest {
    /// The shell command to run through `/bin/sh -c`.
    pub command: String,
    /// The folder the command runs in.
    pub cwd: PathBuf,
    /// The environment the role allowlist reads from.
    pub source_env: BTreeMap<String, String>,
    /// The names the project configures for the verify role.
    pub configured_env: Vec<String>,
    /// The names the selected harness reads for its model.
    pub agent_env: Vec<String>,
    /// The change folder passed as `OSQ_CHANGE`, or none.
    pub change: Option<String>,
    /// The diff file passed as `OSQ_DIFF`, or none.
    pub diff: Option<String>,
    /// Variables set after `OSQ_CHANGE` and `OSQ_DIFF`.
    pub extra_env: BTreeMap<String, String>,
    /// How long the command may run, or `None` for no limit.
    pub timeout: Option<Duration>,
    /// How long the runner waits after a stop or an exit.
    pub kill_grace: Duration,
}

/// How one verify run ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifyOutcome {
    /// The exit code, 1 for a timeout or a signal.
    pub exit_code: i32,
    /// Whether the runner stopped the command after its timeout.
    pub timed_out: bool,
    /// stdout and stderr in the order the runner read them, made project-relative.
    pub output: String,
    /// How long the command took.
    pub duration: Duration,
}

/// Runs one verify command and reports its exit, timeout, output and duration.
///
/// The command sees only the verify role's environment plus `OSQ_CHANGE` and
/// `OSQ_DIFF`, with `request.extra_env` last. It runs in its own process group
/// and is stopped as a group after `request.timeout`.
///
/// # Errors
///
/// Returns [`ProcessError::Spawn`] when `/bin/sh` cannot be started in the
/// request's folder.
///
/// Implements: rust-harnesses/verify-command
/// Implements: rust-harnesses/verify-environment
/// Implements: rust-harnesses/verify-outcome
pub fn run_verify(request: &VerifyRequest) -> Result<VerifyOutcome, ProcessError> {
    let env = env::build(request);
    let started = Instant::now();
    let run = runner::run(request, &env)?;
    Ok(VerifyOutcome {
        exit_code: output::exit_code(run.status, run.timed_out),
        timed_out: run.timed_out,
        output: output::relativize(&request.cwd, &run.output),
        duration: started.elapsed(),
    })
}
