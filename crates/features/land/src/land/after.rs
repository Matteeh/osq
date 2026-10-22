//! The after-land command after a successful land: running it, its tail, and
//! its failure record.

use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::Timeouts;
use osq_kernel_harnesses::{VerifyRequest, run_verify};
use osq_kernel_storage::read_after_land_failure;
use serde_json::json;
use sha2::{Digest, Sha256};

use super::{failed, text, time};

/// The record's file under the project's watch state folder.
const AFTER_LAND_FILE: &str = "after-land.json";
/// How many non-blank output lines a failure keeps.
const OUTPUT_TAIL_LINES: usize = 20;

/// How one after-land run ended: its passing line or its failure lines.
pub(crate) enum Outcome {
    /// The command passed, giving the line to add.
    Passed(String),
    /// The command failed, giving the lines to add.
    Failed(Vec<String>),
}

/// Appends the after-land outcome to a successful land's output.
///
/// # Errors
///
/// Returns a `Failed` error with the command `land` carrying the land's output
/// and the failure lines when the command fails or its record cannot be written.
///
/// Implements: rust-land/land-after-land-command
pub(crate) fn finish(
    root: &Path,
    folder: &str,
    command: Option<&str>,
    timeouts: &Timeouts,
    output: String,
) -> Result<String, FeatureError> {
    let Some(command) = command else {
        return Ok(output);
    };
    match run(root, folder, command, timeouts)? {
        Outcome::Passed(line) => Ok(format!("{output}{line}\n")),
        Outcome::Failed(lines) => Err(failed(format!("{output}{}", lines.join("\n")))),
    }
}

/// Reruns the after-land command for a landed change whose record names it.
///
/// # Errors
///
/// Returns a `Failed` error with the command `land` carrying the failure lines
/// and the landed line when the rerun fails or its record cannot be written.
///
/// Implements: rust-land/land-after-land-retry
pub(crate) fn retry(
    root: &Path,
    folder: &str,
    command: Option<&str>,
    timeouts: &Timeouts,
    landed: String,
) -> Result<String, FeatureError> {
    let Some(command) = command else {
        return Ok(landed);
    };
    let home = std::env::var("HOME").unwrap_or_default();
    let Some(record) = read_after_land_failure(root, Path::new(&home)) else {
        return Ok(landed);
    };
    if record.change != folder {
        return Ok(landed);
    }
    match run(root, folder, command, timeouts)? {
        Outcome::Passed(line) => Ok(format!("{line}\n{landed}")),
        Outcome::Failed(lines) => Err(failed(format!(
            "{}\n{}",
            lines.join("\n"),
            landed.trim_end_matches('\n')
        ))),
    }
}

/// Runs the command in `root` and records or clears its failure.
///
/// # Errors
///
/// Returns a `Failed` error with the command `land` when the record cannot be
/// written or removed.
///
/// Implements: rust-land/land-after-land-command
fn run(
    root: &Path,
    folder: &str,
    command: &str,
    timeouts: &Timeouts,
) -> Result<Outcome, FeatureError> {
    let request = VerifyRequest {
        command: command.to_owned(),
        cwd: root.to_path_buf(),
        source_env: std::env::vars().collect::<BTreeMap<_, _>>(),
        configured_env: Vec::new(),
        agent_env: Vec::new(),
        change: None,
        diff: None,
        extra_env: BTreeMap::new(),
        timeout: Some(timeouts.verify_timeout),
        kill_grace: timeouts.harness_kill_grace,
    };
    let (exit_code, output) = match run_verify(&request) {
        Ok(outcome) => (outcome.exit_code, outcome.output),
        Err(error) => (1, error.to_string()),
    };
    if exit_code == 0 {
        clear_record(root)?;
        return Ok(Outcome::Passed(format!(
            "After-land command passed: {command}"
        )));
    }
    write_record(root, folder, command, exit_code)?;
    Ok(Outcome::Failed(failure_lines(folder, command, &output)))
}

/// The failed lines: the command, its output tail and the retry line.
///
/// Implements: rust-land/land-after-land-command
fn failure_lines(folder: &str, command: &str, output: &str) -> Vec<String> {
    let mut lines = vec![format!("After-land command failed: {command}")];
    let tail = output_tail(output);
    if !tail.is_empty() {
        lines.extend(tail.lines().map(str::to_owned));
    }
    lines.push(format!(
        "run osq land {} again to retry it",
        text::change_id(folder)
    ));
    lines
}

/// The last twenty lines after dropping the output's trailing blank lines.
///
/// Implements: rust-land/land-after-land-command
fn output_tail(output: &str) -> String {
    let mut lines: Vec<&str> = output.lines().collect();
    while lines.last().is_some_and(|line| line.trim().is_empty()) {
        lines.pop();
    }
    let start = lines.len().saturating_sub(OUTPUT_TAIL_LINES);
    lines[start..].join("\n")
}

/// Writes the failure record, creating its folders.
///
/// Implements: rust-land/land-after-land-command
fn write_record(
    root: &Path,
    folder: &str,
    command: &str,
    exit_code: i32,
) -> Result<(), FeatureError> {
    let path = record_path(root);
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|error| failed(error.to_string()))?;
    }
    let record = json!({
        "change": folder,
        "command": command,
        "exitCode": exit_code,
        "failedAt": time::format_utc(time::now_ms()),
    });
    fs::write(path, format!("{record}\n")).map_err(|error| failed(error.to_string()))
}

/// Removes the failure record when it exists.
///
/// Implements: rust-land/land-after-land-command
fn clear_record(root: &Path) -> Result<(), FeatureError> {
    match fs::remove_file(record_path(root)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(failed(error.to_string())),
    }
}

/// The record's path under `HOME` and the checkout root's canonical hash.
///
/// Implements: rust-land/land-after-land-command
fn record_path(root: &Path) -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    let real = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    PathBuf::from(home)
        .join(".osq")
        .join("watch")
        .join(path_hash(&real))
        .join(AFTER_LAND_FILE)
}

/// The lowercase hex SHA-256 of a path's text.
///
/// Implements: rust-land/land-after-land-command
fn path_hash(path: &Path) -> String {
    let digest = Sha256::digest(path.to_string_lossy().as_bytes());
    let mut hex = String::with_capacity(64);
    for byte in digest {
        let _ = write!(hex, "{byte:02x}");
    }
    hex
}
