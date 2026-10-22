//! Refusing a target that a watcher is still running, or left running.

use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use serde_json::Value;

use super::args::CHANGE;
use super::text;

/// Refuses a running target, naming a pid no process holds.
///
/// # Errors
///
/// Returns a `Failed` error with the command `retry` when any task of a
/// `change` target runs, or when the task's pid file exists.
///
/// Implements: rust-retry/retry-refusals
pub(crate) fn check(folder: &Path, id: &str, target: &str) -> Result<(), FeatureError> {
    let dir = folder.join(".run").join("running");
    if target == CHANGE {
        return if any_pid(&dir) {
            Err(text::change_running(id))
        } else {
            Ok(())
        };
    }
    let path = dir.join(format!("{target}.pid"));
    if !path.exists() {
        return Ok(());
    }
    let text = fs::read_to_string(&path).unwrap_or_default();
    match recorded_pid(&text) {
        Some(pid) if !is_running(pid) => Err(text::task_left_running(id, target, pid)),
        _ => Err(text::task_running(target)),
    }
}

/// Whether any entry of `dir` is a pid file, as TypeScript lists them.
///
/// Implements: rust-retry/retry-refusals
fn any_pid(dir: &Path) -> bool {
    fs::read_dir(dir).is_ok_and(|entries| {
        entries
            .flatten()
            .any(|entry| entry.file_name().to_string_lossy().ends_with(".pid"))
    })
}

/// The integer `pid` of a pid file's JSON object, or none when it has none.
///
/// Implements: rust-retry/retry-refusals
fn recorded_pid(text: &str) -> Option<i64> {
    let value: Value = serde_json::from_str(text).ok()?;
    value.get("pid").and_then(Value::as_i64)
}

/// Whether a positive pid still has a process entry.
///
/// Implements: rust-retry/retry-refusals
fn is_running(pid: i64) -> bool {
    let Ok(pid) = u32::try_from(pid) else {
        return false;
    };
    Path::new("/proc").join(pid.to_string()).exists()
}
