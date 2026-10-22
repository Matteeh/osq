//! Reading the records that wait for a human: usage pauses, autopilot stops
//! and failed after-land commands.
//!
//! Every reader mirrors its TypeScript sibling and never fails: a missing or
//! unusable record reads as `None`.
//!
//! Implements: rust-storage/usage-pause-record
//! Implements: rust-storage/autopilot-stop-record
//! Implements: rust-storage/after-land-failure-record

use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_specs::parse_frontmatter;
use serde_json::Value;
use sha2::{Digest, Sha256};
use yaml_rust2::Yaml;
use yaml_rust2::yaml::Hash;

use super::text::timestamp_ms;

/// The default body when a usage limit carried no error.
const DEFAULT_BODY: &str = "usage limit reached";

/// Every reason an autopilot stop records.
const REASONS: [&str; 9] = [
    "queue_unreadable",
    "not_approved",
    "changed_since_approval",
    "rejected",
    "plan_refused",
    "planner_not_ready",
    "approve_refused",
    "halted",
    "land_stopped",
];

/// One change folder's `.run/paused.md` record.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PauseRecord {
    /// The task number, as the file writes it.
    pub task: String,
    /// The fixed-form time the task may run again.
    pub until: String,
    /// Where the time came from: `harness` or `wait`.
    pub source: String,
    /// The limit's error, or `None` without one.
    pub error: Option<String>,
}

/// One `openspec/.run/autopilot-stop.md` record.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AutopilotStop {
    /// Why autopilot stopped.
    pub reason: String,
    /// The queue item autopilot stopped on.
    pub item: String,
    /// The change id, absent before the item has a change.
    pub change: Option<String>,
    /// The one command that resumes the queue.
    pub command: String,
    /// When autopilot stopped.
    pub at: String,
    /// The body without one trailing newline, or `None` when empty.
    pub detail: Option<String>,
}

/// One failed after-land command, as `after-land.json` writes it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AfterLandFailure {
    /// The change folder the command ran for.
    pub change: String,
    /// The command that failed.
    pub command: String,
    /// The command's exit code.
    pub exit_code: i64,
    /// When the command failed.
    pub failed_at: String,
}

/// Reads a change folder's `.run/paused.md`, or `None` for a missing or
/// malformed file.
///
/// Implements: rust-storage/usage-pause-record
#[must_use]
pub fn read_usage_pause(folder: &Path) -> Option<PauseRecord> {
    let content = fs::read_to_string(folder.join(".run").join("paused.md")).ok()?;
    let frontmatter = parse_frontmatter(&content).ok()?;
    let task = string_field(&frontmatter.data, "task")?;
    let until = string_field(&frontmatter.data, "until")?;
    timestamp_ms(&until)?;
    let source = string_field(&frontmatter.data, "source")?;
    if source != "harness" && source != "wait" {
        return None;
    }
    let text = frontmatter.body.trim();
    let error = if text.is_empty() || text == DEFAULT_BODY {
        None
    } else {
        Some(text.to_owned())
    };
    Some(PauseRecord {
        task,
        until,
        source,
        error,
    })
}

/// Reads `<project_root>/openspec/.run/autopilot-stop.md`, or `None` for a
/// missing or malformed file.
///
/// Implements: rust-storage/autopilot-stop-record
#[must_use]
pub fn read_autopilot_stop(project_root: &Path) -> Option<AutopilotStop> {
    let path = project_root
        .join("openspec")
        .join(".run")
        .join("autopilot-stop.md");
    let content = fs::read_to_string(path).ok()?;
    let frontmatter = parse_frontmatter(&content).ok()?;
    let reason = string_field(&frontmatter.data, "reason")?;
    if !REASONS.contains(&reason.as_str()) {
        return None;
    }
    let item = string_field(&frontmatter.data, "item")?;
    let change = match frontmatter.data.get(&Yaml::String(String::from("change"))) {
        None => None,
        Some(value) => Some(value.as_str()?.to_owned()),
    };
    let command = string_field(&frontmatter.data, "command")?;
    let at = string_field(&frontmatter.data, "at")?;
    let body = &frontmatter.body;
    let detail = if body.trim().is_empty() {
        None
    } else {
        Some(body.strip_suffix('\n').unwrap_or(body).to_owned())
    };
    Some(AutopilotStop {
        reason,
        item,
        change,
        command,
        at,
        detail,
    })
}

/// The per-project state folder, `<home>/.osq/watch/<hash>`, where the hash is
/// the SHA-256 of the project root's canonical path.
///
/// Implements: rust-storage/after-land-failure-record
#[must_use]
pub fn watch_state_dir(project_root: &Path, home: &Path) -> PathBuf {
    let real = fs::canonicalize(project_root)
        .or_else(|_| std::path::absolute(project_root))
        .unwrap_or_else(|_| project_root.to_path_buf());
    let digest = Sha256::digest(real.to_string_lossy().as_bytes());
    let mut hash = String::with_capacity(64);
    for byte in digest {
        let _ = write!(hash, "{byte:02x}");
    }
    home.join(".osq").join("watch").join(hash)
}

/// Reads the watch state folder's `after-land.json`, or `None` for a missing
/// or malformed file.
///
/// Implements: rust-storage/after-land-failure-record
#[must_use]
pub fn read_after_land_failure(project_root: &Path, home: &Path) -> Option<AfterLandFailure> {
    let path = watch_state_dir(project_root, home).join("after-land.json");
    let content = fs::read_to_string(path).ok()?;
    let parsed: Value = serde_json::from_str(&content).ok()?;
    let record = parsed.as_object()?;
    let change = record.get("change")?.as_str()?.to_owned();
    let command = record.get("command")?.as_str()?.to_owned();
    let exit_code = record.get("exitCode")?.as_i64()?;
    let failed_at = record.get("failedAt")?.as_str()?.to_owned();
    Some(AfterLandFailure {
        change,
        command,
        exit_code,
        failed_at,
    })
}

/// A top-level frontmatter key's string value, or `None` without one.
fn string_field(data: &Hash, key: &str) -> Option<String> {
    data.get(&Yaml::String(key.to_owned()))?
        .as_str()
        .map(ToOwned::to_owned)
}
