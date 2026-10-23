//! Reading the watcher and service records under a project's watch state folder.
//!
//! A record counts only while the pid it names is alive, as TypeScript's
//! `readWatchState` decides it.
//!
//! Implements: rust-storage/watch-state-records

use std::fs;
use std::num::NonZeroU64;
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::pending::watch_state_dir;

/// What `osq watch --background` writes for its supervisor.
///
/// Implements: rust-storage/watch-state-records
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ServiceRecord {
    /// The supervisor's pid.
    pub pid: u64,
    /// When the supervisor started.
    pub started_at: String,
    /// The absolute path of `watch.log`.
    pub log: String,
}

/// The mode a continuous watcher runs in.
///
/// Implements: rust-storage/watch-state-records
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WatcherMode {
    /// A watcher started by `osq watch --background`.
    Background,
    /// A watcher running in a terminal.
    Terminal,
}

/// What a continuous watcher writes for itself.
///
/// Implements: rust-storage/watch-state-records
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WatcherRecord {
    /// The watcher's pid.
    pub pid: u64,
    /// The mode the watcher runs in.
    pub mode: WatcherMode,
    /// The osq version the watcher runs.
    pub version: String,
    /// The commit the watcher was built from.
    pub commit: String,
    /// When the watcher started.
    pub started_at: String,
    /// Why the watcher starts no task, or `None` without a reason.
    pub waiting: Option<String>,
}

/// The parsed records and log location for one project.
///
/// Implements: rust-storage/watch-state-records
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WatchState {
    /// The service record, or `None` when it is missing, unusable or dead.
    pub service: Option<ServiceRecord>,
    /// The watcher record, or `None` when it is missing, unusable or dead.
    pub watcher: Option<WatcherRecord>,
    /// The absolute path of `watch.log`, whether or not it exists.
    pub log: PathBuf,
    /// Whether `watch.log` exists.
    pub log_exists: bool,
}

/// Reads a project's watch state, counting a record only while its pid lives.
///
/// Implements: rust-storage/watch-state-records
#[must_use]
pub fn read_watch_state(project_root: &Path, home: &Path) -> WatchState {
    let dir = watch_state_dir(project_root, home);
    let log = dir.join("watch.log");
    WatchState {
        service: read_service(&dir.join("service.json")),
        watcher: read_watcher(&dir.join("watcher.json")),
        log_exists: log.exists(),
        log,
    }
}

/// Reads one service record, or `None` when it is unusable or dead.
fn read_service(path: &Path) -> Option<ServiceRecord> {
    let record = read_object(path)?;
    let pid = record.get("pid")?.as_u64()?;
    if !is_live(pid) {
        return None;
    }
    Some(ServiceRecord {
        pid,
        started_at: record.get("startedAt")?.as_str()?.to_owned(),
        log: record.get("log")?.as_str()?.to_owned(),
    })
}

/// Reads one watcher record, or `None` when it is unusable or dead.
fn read_watcher(path: &Path) -> Option<WatcherRecord> {
    let record = read_object(path)?;
    let pid = record.get("pid")?.as_u64()?;
    if !is_live(pid) {
        return None;
    }
    let mode = match record.get("mode")?.as_str()? {
        "background" => WatcherMode::Background,
        "terminal" => WatcherMode::Terminal,
        _ => return None,
    };
    let waiting = match record.get("waiting")? {
        Value::Null => None,
        Value::String(text) => Some(text.clone()),
        _ => return None,
    };
    Some(WatcherRecord {
        pid,
        mode,
        version: record.get("version")?.as_str()?.to_owned(),
        commit: record.get("commit")?.as_str()?.to_owned(),
        started_at: record.get("startedAt")?.as_str()?.to_owned(),
        waiting,
    })
}

/// Reads a file as a JSON object, or `None` when it is missing or unusable.
fn read_object(path: &Path) -> Option<Value> {
    let content = fs::read_to_string(path).ok()?;
    let parsed: Value = serde_json::from_str(&content).ok()?;
    parsed.as_object()?;
    Some(parsed)
}

/// Whether a pid names a live process: above 0 and `/proc/<pid>` exists.
fn is_live(pid: u64) -> bool {
    NonZeroU64::new(pid).is_some_and(|pid| Path::new(&format!("/proc/{pid}")).exists())
}
