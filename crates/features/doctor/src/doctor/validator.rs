//! Doctor's validator runs, harness and model lines.
//!
//! The lines are pure text; only this module reads archived changes through
//! storage and probes the validator's harness (ADR 022, ADR 023).

use std::collections::BTreeMap;
use std::path::Path;

use osq_kernel_config::{Config, Harness};
use osq_kernel_storage::{ChangeSnapshot, Location, read_change, validator_failing};

use super::changes::{list_folders, real_root};
use super::harness::harness_lines;

/// Builds the validator's three checks, in TypeScript's order.
///
/// Implements: rust-doctor/doctor-validator-checks
pub(super) fn validator_lines(
    root: &Path,
    env: &BTreeMap<String, String>,
    config: &Config,
) -> Vec<String> {
    let Some(validator) = &config.validator else {
        return Vec::new();
    };
    if !validator.enabled {
        return Vec::new();
    }
    let Some(harness) = validator.harness else {
        return Vec::new();
    };
    let model = validator.model.as_deref().unwrap_or_default();
    let mut lines = Vec::new();
    if let Some(line) = runs_line(root, config, harness) {
        lines.push(line);
    }
    if harness != config.executor.harness {
        lines.extend(
            harness_lines(root, env, config, harness)
                .iter()
                .map(|line| prefixed(line)),
        );
    }
    lines.push(model_line(config, harness, model));
    lines
}

/// Builds the `validator-runs` line from the archived changes' latest run.
///
/// Implements: rust-doctor/doctor-validator-checks
fn runs_line(root: &Path, config: &Config, harness: Harness) -> Option<String> {
    let real = real_root(root);
    let snapshots: Vec<ChangeSnapshot> = list_folders(&real, config)
        .iter()
        .filter(|entry| entry.location == Location::Archived)
        .filter_map(|entry| read_change(entry).ok())
        .collect();
    let failing = validator_failing(&snapshots)?;
    let id = leading_digits(&failing.change);
    Some(format!(
        "[fail] validator-runs: validator {} {}× in a row, last on {id}: {} — update the {} harness or change validator.model",
        failing.outcome.as_str(),
        failing.runs,
        failing.error,
        harness.as_str()
    ))
}

/// The change folder's leading digits, or the whole name when it has none.
///
/// Implements: rust-doctor/doctor-validator-checks
fn leading_digits(folder: &str) -> String {
    let digits: String = folder.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        folder.to_owned()
    } else {
        digits
    }
}

/// Puts `validator-` before a check line's name.
///
/// Implements: rust-doctor/doctor-validator-checks
fn prefixed(line: &str) -> String {
    let Some((status, rest)) = line.split_once("] ") else {
        return line.to_owned();
    };
    let Some((name, message)) = rest.split_once(": ") else {
        return line.to_owned();
    };
    format!("{status}] validator-{name}: {message}")
}

/// Builds the `validator-model` line from both roles' harnesses and models.
///
/// Implements: rust-doctor/doctor-validator-checks
fn model_line(config: &Config, harness: Harness, model: &str) -> String {
    let executor_harness = config.executor.harness;
    let executor_model = executor_model(config);
    if harness == executor_harness && model == executor_model {
        return format!(
            "[warn] validator-model: validator uses the executor's harness and model ({}/{model}); its findings share the executor's blind spots",
            harness.as_str()
        );
    }
    format!(
        "[ok] validator-model: validator {}/{model}, executor {}/{executor_model}",
        harness.as_str(),
        executor_harness.as_str()
    )
}

/// The executor's model: its setting, pi's when it is pi, else `default`.
///
/// Implements: rust-doctor/doctor-validator-checks
fn executor_model(config: &Config) -> String {
    if let Some(model) = &config.executor.model {
        return model.clone();
    }
    if config.executor.harness == Harness::Pi
        && let Some(model) = &config.pi.model
    {
        return model.clone();
    }
    "default".to_owned()
}
