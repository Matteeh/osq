//! Probing pi's `--version` through the process runner.

use std::collections::BTreeMap;
use std::path::Path;

use osq_kernel_config::Timeouts;
use osq_kernel_harnesses::{ProcessSpec, run_process};

/// Runs `<bin> --version` and returns the version text, or the failure reason.
///
/// Implements: rust-doctor/doctor-pi-checks
pub(super) fn probe(
    bin: &str,
    root: &Path,
    env: &BTreeMap<String, String>,
    timeouts: &Timeouts,
) -> Result<String, String> {
    let mut stdout = Vec::new();
    let process = ProcessSpec {
        program: bin.to_owned(),
        args: vec!["--version".to_owned()],
        cwd: root.to_path_buf(),
        env: env.clone(),
        timeout: Some(timeouts.harness_preflight),
        kill_grace: timeouts.harness_kill_grace,
    };
    let result = run_process(&process, &mut |line| stdout.push(line.to_owned()));
    let outcome = match result {
        Ok(outcome) => outcome,
        Err(error) => return Err(error.to_string()),
    };
    if outcome.timed_out {
        return Err("timed out".to_owned());
    }
    if outcome.exit_code != 0 {
        return Err(format!("exited with code {}", outcome.exit_code));
    }
    Ok(version_text(&stdout, &outcome.stderr))
}

/// Takes stdout's lines joined, else stderr, trims both, then the first line.
///
/// Implements: rust-doctor/doctor-pi-checks
fn version_text(stdout: &[String], stderr: &str) -> String {
    let raw = if stdout.is_empty() {
        stderr.to_owned()
    } else {
        stdout.join("\n")
    };
    raw.trim().lines().next().unwrap_or("").trim().to_owned()
}
