//! Running doctor's configuration and harness checks, in TypeScript's line order.
//!
//! The lines are pure text; only the orchestrator reads the config and starts
//! a harness (ADR 023). Doctor writes no file (ADR 025).

mod changes;
mod decisions;
mod git;
mod harness;
mod languages;
mod managed;
mod prices;
mod probe;
mod validator;

use std::collections::BTreeMap;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::{Config, Harness, load_config};
use osq_kernel_vcs::project_git_root;

use changes::change_lines;
use decisions::decisions_line;
use git::git_lines;
use harness::{containment_line, harness_lines};
use managed::managed_blocks_line;
use prices::planning_prices_line;
use validator::validator_lines;

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
    let (mut lines, config) = collect_lines(root, &env)?;
    lines.push(managed_blocks_line(root, &config));
    if let Some(line) = decisions_line(root, &config) {
        lines.push(line);
    }
    lines.extend(change_lines(root, &config));
    let git = git_lines(root, &config, &env);
    lines.extend(git.lines);
    if let Some(line) = languages::languages_line(root, git.tracked.as_deref()) {
        lines.push(line);
    }
    if let Some(line) = planning_prices_line(root, &config) {
        lines.push(line);
    }
    lines.extend(validator_lines(root, &env, &config));
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

/// Builds the configuration and harness lines for one root and one process
/// environment, along with the config the change checks use.
///
/// Implements: rust-doctor/doctor-pi-checks
fn collect_lines(
    root: &Path,
    env: &BTreeMap<String, String>,
) -> Result<(Vec<String>, Config), FeatureError> {
    match load_config(root) {
        Ok(config) => {
            project_git_root(root, &config)
                .map_err(|error| FeatureError::failed("doctor", error.to_string()))?;
            let harness = config.executor.harness;
            let mut lines = vec![config_line(&config)];
            lines.extend(harness_lines(root, env, &config, harness));
            lines.push(containment_line(&config, harness));
            Ok((lines, config))
        }
        Err(error) => {
            let config = Config::default();
            let mut lines = vec![format!("[fail] config: failed to load: {error}")];
            lines.extend(harness_lines(root, env, &config, Harness::Agy));
            Ok((lines, config))
        }
    }
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
