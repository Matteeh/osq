//! Checking pi before a task run: its binary, version and credentials.
//!
//! The caller gives every input, including the tested range and both timeouts.
//! Each program starts through the process runner with exactly the caller's
//! environment (ADR 007); printing a version warning is the caller's work.

mod auth;
mod binary;
mod error;
mod version;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub use binary::resolve_pi_binary;
pub use error::PiPreflightError;
pub use version::{PiVersionAssessment, PiVersionRange, assess_pi_version};

use crate::process::{ProcessError, ProcessOutcome, ProcessSpec, run_process};

/// One pi preflight request, with every input from the caller.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PiPreflight {
    /// The pi program to run.
    pub bin: String,
    /// The provider whose credentials to check, when set.
    pub provider: Option<String>,
    /// The folder both programs run in.
    pub cwd: PathBuf,
    /// The only variables both programs see.
    pub env: BTreeMap<String, String>,
    /// How long each program may run.
    pub timeout: Duration,
    /// How long the runner waits after a stop or an exit.
    pub kill_grace: Duration,
    /// The tested version range.
    pub range: PiVersionRange,
}

/// A pi preflight that passed, with the warning the caller should print.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PiReady {
    /// The probe's version text.
    pub version: String,
    /// The version warning, absent inside the tested range.
    pub warning: Option<String>,
}

/// Runs pi's version probe and, when a provider is set, its auth check.
///
/// # Errors
///
/// Returns [`PiPreflightError::Binary`] when the version probe cannot start or
/// fails, and [`PiPreflightError::Credentials`] when the auth check is not
/// `ready`.
///
/// Implements: rust-harnesses/pi-preflight
pub fn preflight_pi(request: PiPreflight) -> Result<PiReady, PiPreflightError> {
    let PiPreflight {
        bin,
        provider,
        cwd,
        env,
        timeout,
        kill_grace,
        range,
    } = request;
    let text = probe_version(&bin, &cwd, &env, timeout, kill_grace)?;
    let assessment = assess_pi_version(&text, range);
    if let Some(provider) = non_blank_provider(provider.as_deref()) {
        check_credentials(&bin, provider, &cwd, &env, timeout, kill_grace)?;
    }
    Ok(PiReady {
        version: assessment.version,
        warning: assessment.warning,
    })
}

/// Returns the provider trimmed, when it is set and not blank.
///
/// Implements: rust-harnesses/pi-preflight
fn non_blank_provider(provider: Option<&str>) -> Option<&str> {
    provider.map(str::trim).filter(|value| !value.is_empty())
}

/// Runs `<bin> --version` and returns the version text it wrote.
///
/// Implements: rust-harnesses/pi-preflight
fn probe_version(
    bin: &str,
    cwd: &Path,
    env: &BTreeMap<String, String>,
    timeout: Duration,
    kill_grace: Duration,
) -> Result<String, PiPreflightError> {
    let mut stdout = Vec::new();
    let result = run_process(
        &spec(
            bin,
            vec!["--version".to_owned()],
            cwd,
            env,
            timeout,
            kill_grace,
        ),
        &mut |line| {
            stdout.push(line.to_owned());
        },
    );
    match result {
        Ok(outcome) if outcome.exit_code == 0 => Ok(version_text(&stdout, &outcome.stderr)),
        Ok(_) | Err(_) => Err(PiPreflightError::Binary {
            bin: bin.to_owned(),
        }),
    }
}

/// Takes the first stdout line, else the first non-blank stderr line.
///
/// Implements: rust-harnesses/pi-preflight
fn version_text(stdout: &[String], stderr: &str) -> String {
    if let Some(line) = stdout.first() {
        return line.clone();
    }
    stderr
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("")
        .to_owned()
}

/// Runs `<bin> auth check --provider <provider> --json` and requires `ready`.
///
/// Implements: rust-harnesses/pi-preflight
fn check_credentials(
    bin: &str,
    provider: &str,
    cwd: &Path,
    env: &BTreeMap<String, String>,
    timeout: Duration,
    kill_grace: Duration,
) -> Result<(), PiPreflightError> {
    let mut stdout = Vec::new();
    let result = run_process(
        &spec(
            bin,
            vec![
                "auth".to_owned(),
                "check".to_owned(),
                "--provider".to_owned(),
                provider.to_owned(),
                "--json".to_owned(),
            ],
            cwd,
            env,
            timeout,
            kill_grace,
        ),
        &mut |line| {
            stdout.push(line.to_owned());
        },
    );
    let failure = failure_reason(&result);
    let assessment = auth::assess(&stdout.join("\n"), failure.as_deref());
    if assessment.status == "ready" {
        return Ok(());
    }
    let detail = assessment.reason.unwrap_or(assessment.status);
    Err(PiPreflightError::Credentials {
        provider: provider.to_owned(),
        detail,
    })
}

/// Builds the process request for one of preflight's programs.
///
/// Implements: rust-harnesses/pi-preflight
fn spec(
    bin: &str,
    args: Vec<String>,
    cwd: &Path,
    env: &BTreeMap<String, String>,
    timeout: Duration,
    kill_grace: Duration,
) -> ProcessSpec {
    ProcessSpec {
        program: bin.to_owned(),
        args,
        cwd: cwd.to_path_buf(),
        env: env.clone(),
        timeout: Some(timeout),
        kill_grace,
    }
}

/// Describes why an auth check run failed, in TypeScript's precedence.
///
/// Implements: rust-harnesses/pi-preflight
fn failure_reason(result: &Result<ProcessOutcome, ProcessError>) -> Option<String> {
    match result {
        Err(error) => Some(error.to_string()),
        Ok(outcome) if outcome.timed_out => Some("pi auth check timed out".to_owned()),
        Ok(outcome) if outcome.exit_code != 0 => Some(format!(
            "pi auth check exited with code {}",
            outcome.exit_code
        )),
        Ok(_) => None,
    }
}
