//! Reading a change's `.run` halt markers, running locks and blocked sections.
//!
//! Implements: rust-storage/marker-facts

use std::fs;
use std::path::Path;

use osq_kernel_specs::parse_frontmatter;
use yaml_rust2::Yaml;
use yaml_rust2::yaml::Hash;

use crate::read::parse_result_sections;

/// The halt markers, running lock and blocked section of one task.
///
/// Implements: rust-storage/marker-facts
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TaskMarkers {
    /// `.run/dead/<n>.md`, or `None` without the file.
    pub dead: Option<HaltMarker>,
    /// `.run/regressed/<n>.md`, or `None` without the file.
    pub regressed: Option<HaltMarker>,
    /// `.run/running/<n>.pid`, or `None` without a readable lock.
    pub lock: Option<RunningLock>,
    /// The `## Blocked` section of `.run/results/<n>.md`.
    pub blocked: Option<String>,
}

/// A halt marker's frontmatter facts and its `- ` body entries.
///
/// Implements: rust-storage/marker-facts
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HaltMarker {
    /// The frontmatter `reason` when it is a string, else empty text.
    pub reason: String,
    /// Whether the frontmatter's `stuck` is the boolean `true`.
    pub stuck: bool,
    /// Whether the frontmatter's `verification_passed` is the boolean `true`.
    pub verification_passed: bool,
    /// The frontmatter `fingerprint` when it is a string, else `None`.
    pub fingerprint: Option<String>,
    /// The trimmed `- ` body lines whose text is not empty, in order.
    pub entries: Vec<String>,
}

/// A running task's lock file: its pid and start time.
///
/// Implements: rust-storage/marker-facts
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RunningLock {
    /// The lock's pid, a whole number of at least 0.
    pub pid: u64,
    /// The lock's `startedAt`, epoch milliseconds.
    pub started_at_ms: i64,
}

/// Reads one task's markers from a change folder.
pub(super) fn read_task_markers(folder: &Path, task: &str) -> TaskMarkers {
    let run = folder.join(".run");
    TaskMarkers {
        dead: read_halt_marker(&run.join("dead").join(format!("{task}.md"))),
        regressed: read_halt_marker(&run.join("regressed").join(format!("{task}.md"))),
        lock: read_running_lock(&run.join("running").join(format!("{task}.pid"))),
        blocked: read_blocked(&run.join("results").join(format!("{task}.md"))),
    }
}

/// Reads a marker file that exists into its facts, even when it cannot be read.
pub(super) fn read_halt_marker(path: &Path) -> Option<HaltMarker> {
    if !path.exists() {
        return None;
    }
    Some(halt_marker(&fs::read_to_string(path).unwrap_or_default()))
}

/// Reads a marker's frontmatter facts and `- ` body entries.
fn halt_marker(text: &str) -> HaltMarker {
    let (data, body) = match parse_frontmatter(text) {
        Ok(frontmatter) => (frontmatter.data, frontmatter.body),
        Err(_) => (Hash::new(), text.to_owned()),
    };
    HaltMarker {
        reason: string_field(&data, "reason").unwrap_or_default(),
        stuck: bool_field(&data, "stuck"),
        verification_passed: bool_field(&data, "verification_passed"),
        fingerprint: string_field(&data, "fingerprint"),
        entries: body
            .lines()
            .filter_map(marker_entry)
            .map(ToOwned::to_owned)
            .collect(),
    }
}

/// A `- text` body line's trimmed text, or `None` for any other line.
fn marker_entry(line: &str) -> Option<&str> {
    let after_dash = line.strip_prefix('-')?;
    let text = after_dash.trim_start();
    if text.len() == after_dash.len() {
        return None;
    }
    let trimmed = text.trim();
    (!trimmed.is_empty()).then_some(trimmed)
}

/// A frontmatter key's string value, or `None` without one.
fn string_field(data: &Hash, key: &str) -> Option<String> {
    data.get(&Yaml::String(key.to_owned()))?
        .as_str()
        .map(ToOwned::to_owned)
}

/// Whether a frontmatter key holds the boolean `true`.
fn bool_field(data: &Hash, key: &str) -> bool {
    matches!(
        data.get(&Yaml::String(key.to_owned())),
        Some(Yaml::Boolean(true))
    )
}

/// Reads a lock file into its pid and start time, or `None` when it does not read.
fn read_running_lock(path: &Path) -> Option<RunningLock> {
    let text = fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    let object = value.as_object()?;
    let pid = object.get("pid")?.as_u64()?;
    let started_at_ms = object.get("startedAt")?.as_i64()?;
    Some(RunningLock { pid, started_at_ms })
}

/// Reads a task result file's `## Blocked` section, or `None` without one.
fn read_blocked(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    parse_result_sections(&text).blocked
}
