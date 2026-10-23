//! Running `vcs.prepare` once in the new worktree.

use std::collections::BTreeMap;
use std::path::Path;

use osq_kernel_config::Timeouts;
use osq_kernel_harnesses::{VerifyRequest, run_verify};

/// Runs `command` in `worktree`, giving its output or process error when it fails.
///
/// Implements: rust-approve/worktree-approval
pub(crate) fn run(worktree: &Path, command: &str, timeouts: &Timeouts) -> Result<(), String> {
    let request = VerifyRequest {
        command: command.to_owned(),
        cwd: worktree.to_path_buf(),
        source_env: std::env::vars().collect::<BTreeMap<_, _>>(),
        configured_env: Vec::new(),
        agent_env: Vec::new(),
        change: None,
        diff: None,
        extra_env: BTreeMap::new(),
        timeout: Some(timeouts.verify_timeout),
        kill_grace: timeouts.harness_kill_grace,
    };
    match run_verify(&request) {
        Ok(outcome) if outcome.exit_code == 0 => Ok(()),
        Ok(outcome) => Err(outcome.output),
        Err(error) => Err(error.to_string()),
    }
}
