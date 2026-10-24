//! Building every harness's doctor lines and its containment line.
//!
//! The lines are pure text; only this module probes the harness programs
//! (ADR 023). Programs, version assessments and containment texts live in
//! their own modules.

mod containment;
mod program;
mod version;

use std::collections::BTreeMap;
use std::path::Path;

use osq_kernel_config::{Config, Harness, Timeouts};
use osq_kernel_harnesses::{
    PiPreflight, PiPreflightError, PiVersionRange, assess_pi_version, preflight_pi,
};

use super::probe::probe;

/// TypeScript's `PI_TESTED_RANGE`, held in code as it holds it (ADR 029).
const PI_TESTED_RANGE: PiVersionRange = PiVersionRange {
    min: [0, 87, 0],
    max: [0, 88, 0],
};

/// Builds one harness's harness, version and auth lines.
///
/// Implements: rust-doctor/doctor-harness-checks
pub(super) fn harness_lines(
    root: &Path,
    env: &BTreeMap<String, String>,
    config: &Config,
    harness: Harness,
) -> Vec<String> {
    if harness == Harness::Pi {
        return pi_lines(root, env, config);
    }
    let Some(bin) = program::resolve(harness, config, env) else {
        return vec!["[ok] harness: no external executable required".to_owned()];
    };
    let version = match probe(&bin, root, env, &config.timeouts) {
        Ok(version) => version,
        Err(reason) => {
            return vec![format!(
                "[fail] harness: binary unavailable: {bin} ({reason})"
            )];
        }
    };
    let mut lines = vec![harness_line(&bin, &version)];
    if let Some(line) = version::line(harness, &version) {
        lines.push(line);
    }
    lines
}

/// Builds the containment line for the executor's harness and its config.
///
/// Implements: rust-doctor/doctor-harness-checks
pub(super) fn containment_line(config: &Config, harness: Harness) -> String {
    containment::line(config, harness)
}

/// Builds pi's harness, version and auth lines.
///
/// Implements: rust-doctor/doctor-pi-checks
fn pi_lines(root: &Path, env: &BTreeMap<String, String>, config: &Config) -> Vec<String> {
    let bin = program::resolve(Harness::Pi, config, env).expect("pi always resolves a program");
    let version = match probe(&bin, root, env, &config.timeouts) {
        Ok(version) => version,
        Err(reason) => {
            return vec![format!(
                "[fail] harness: binary unavailable: {bin} ({reason})"
            )];
        }
    };
    let mut lines = vec![harness_line(&bin, &version), pi_version_line(&version)];
    if let Some(provider) = config.pi.provider.as_deref() {
        lines.push(auth_line(&bin, provider, root, env, &config.timeouts));
    }
    lines
}

/// Formats the harness line, with no trailing space when the version is empty.
///
/// Implements: rust-doctor/doctor-harness-checks
fn harness_line(bin: &str, version: &str) -> String {
    format!("[ok] harness: {bin} {version}")
        .trim_end()
        .to_owned()
}

/// Formats pi's version line, warning outside TypeScript's tested range.
///
/// Implements: rust-doctor/doctor-pi-checks
fn pi_version_line(version: &str) -> String {
    let assessment = assess_pi_version(version, PI_TESTED_RANGE);
    if assessment.tested {
        return format!("[ok] harness-version: Pi {version} (tested {PI_TESTED_RANGE})");
    }
    format!(
        "[warn] harness-version: {}",
        assessment.warning.unwrap_or_default()
    )
}

/// Formats the auth line from pi's preflight for the configured provider.
///
/// Implements: rust-doctor/doctor-pi-checks
fn auth_line(
    bin: &str,
    provider: &str,
    root: &Path,
    env: &BTreeMap<String, String>,
    timeouts: &Timeouts,
) -> String {
    let request = PiPreflight {
        bin: bin.to_owned(),
        provider: Some(provider.to_owned()),
        cwd: root.to_path_buf(),
        env: env.clone(),
        timeout: timeouts.harness_preflight,
        kill_grace: timeouts.harness_kill_grace,
        range: PI_TESTED_RANGE,
    };
    match preflight_pi(request) {
        Ok(_) => format!("[ok] harness-auth: {provider} credentials ready"),
        Err(PiPreflightError::Credentials { detail, .. }) => {
            format!("[fail] harness-auth: {provider} credentials not ready: {detail}")
        }
        Err(error) => format!("[fail] harness-auth: {provider} credentials not ready: {error}"),
    }
}
