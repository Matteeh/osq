//! Running doctor's configuration and pi checks, in TypeScript's line order.
//!
//! The lines are pure text; only the orchestrator reads the config and starts
//! pi (ADR 023). Doctor writes no file (ADR 025).

mod probe;

use std::collections::BTreeMap;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::{Config, Harness, Timeouts, load_config};
use osq_kernel_harnesses::{
    PiPreflight, PiPreflightError, PiVersionRange, assess_pi_version, preflight_pi,
    resolve_pi_binary,
};

use probe::probe;

/// TypeScript's `PI_TESTED_RANGE`, held in code as it holds it (ADR 029).
const PI_TESTED_RANGE: PiVersionRange = PiVersionRange {
    min: [0, 87, 0],
    max: [0, 88, 0],
};

/// Runs every doctor check and returns its lines, or fails with all of them.
///
/// # Errors
///
/// Returns `Failed` with the command `doctor` and its joined lines when any
/// line starts with `[fail]`.
///
/// Implements: rust-doctor/doctor-pi-checks
pub(crate) fn run_doctor(root: &Path) -> Result<String, FeatureError> {
    let env: BTreeMap<String, String> = std::env::vars().collect();
    let lines = collect_lines(root, &env);
    if lines.iter().any(|line| line.starts_with("[fail]")) {
        return Err(FeatureError::failed("doctor", lines.join("\n")));
    }
    let mut output = String::new();
    for line in lines {
        output.push_str(&line);
        output.push('\n');
    }
    Ok(output)
}

/// Builds the check lines for one root and one process environment.
///
/// Implements: rust-doctor/doctor-pi-checks
fn collect_lines(root: &Path, env: &BTreeMap<String, String>) -> Vec<String> {
    let config = match load_config(root) {
        Ok(config) => config,
        Err(error) => return vec![format!("[fail] config: failed to load: {error}")],
    };
    let mut lines = vec![config_line(&config)];
    if config.executor.harness != Harness::Pi {
        return lines;
    }
    let bin = resolve_pi_binary(config.pi.bin.as_deref(), env);
    let version = match probe(&bin, root, env, &config.timeouts) {
        Ok(version) => version,
        Err(reason) => {
            lines.push(format!(
                "[fail] harness: binary unavailable: {bin} ({reason})"
            ));
            return lines;
        }
    };
    lines.push(harness_line(&bin, &version));
    lines.push(version_line(&version));
    if let Some(provider) = config.pi.provider.as_deref() {
        lines.push(auth_line(&bin, provider, root, env, &config.timeouts));
    }
    lines
}

/// Formats the configuration line the loaded config earned.
///
/// Implements: rust-doctor/doctor-pi-checks
fn config_line(config: &Config) -> String {
    format!(
        "[ok] config: loaded (harness: {})",
        config.executor.harness.as_str()
    )
}

/// Formats the harness line, with no trailing space when the version is empty.
///
/// Implements: rust-doctor/doctor-pi-checks
fn harness_line(bin: &str, version: &str) -> String {
    format!("[ok] harness: {bin} {version}")
        .trim_end()
        .to_owned()
}

/// Formats the version line, warning outside TypeScript's tested range.
///
/// Implements: rust-doctor/doctor-pi-checks
fn version_line(version: &str) -> String {
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
