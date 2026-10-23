//! The last-sync and sync-stop lines of a worktree change.

use std::fs;

use serde_json::{Map, Value};

use crate::events::js_number;
use crate::model::Change;

/// The last `synced` event a change recorded.
struct Sync {
    /// The event's timestamp.
    timestamp: String,
    /// The default branch it synced from.
    default_branch: String,
    /// How many commits it took.
    commits: f64,
    /// Whether it took exactly one commit.
    single: bool,
}

/// A `sync_stopped` event that came after the last completed sync.
struct Stop {
    /// The event's timestamp.
    timestamp: String,
    /// The stop's reason.
    reason: String,
    /// The stop's message.
    message: String,
}

/// A worktree change's last sync and the stop that came after it.
#[derive(Default)]
struct State {
    /// The last completed sync, when there is one.
    sync: Option<Sync>,
    /// The stop after that sync, when there is one.
    stop: Option<Stop>,
}

/// The last-sync and sync-stop lines of a worktree change.
///
/// Implements: rust-show/status-text-equals-typescript-s
pub(crate) fn lines(change: &Change) -> Vec<String> {
    let state = read(&change.path);
    let mut lines = Vec::new();
    if let Some(sync) = &state.sync {
        let noun = if sync.single { "commit" } else { "commits" };
        lines.push(format!(
            "  last sync: {}, {} {noun} from {}",
            sync.timestamp,
            js_number(sync.commits),
            sync.default_branch
        ));
    }
    if let Some(stop) = &state.stop {
        lines.push(format!(
            "  sync stopped: {} ({}); run osq sync {} again once it is fixed",
            stop.timestamp,
            stop.reason,
            crate::status::id(&change.folder)
        ));
        lines.push(format!(
            "    {}",
            stop.message.split('\n').next().unwrap_or("")
        ));
    }
    lines
}

/// Reads a change's `change.jsonl`, keeping its last sync and a later stop.
fn read(folder: &std::path::Path) -> State {
    let path = folder.join(".run").join("events").join("change.jsonl");
    let Ok(text) = fs::read_to_string(path) else {
        return State::default();
    };
    let mut state = State::default();
    for line in text.split('\n') {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(Value::Object(event)) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        match event.get("type").and_then(Value::as_str) {
            Some("synced") => {
                if let Some(sync) = sync_event(&event) {
                    state.sync = Some(sync);
                    state.stop = None;
                }
            }
            Some("sync_stopped") => {
                if let Some(stop) = stop_event(&event) {
                    state.stop = Some(stop);
                }
            }
            _ => {}
        }
    }
    state
}

/// One `synced` event's fields, or none when any is missing.
fn sync_event(event: &Map<String, Value>) -> Option<Sync> {
    let timestamp = event.get("timestamp")?.as_str()?.to_owned();
    let data = event.get("data")?.as_object()?;
    let commits = data.get("commits")?;
    Some(Sync {
        timestamp,
        default_branch: data.get("defaultBranch")?.as_str()?.to_owned(),
        commits: commits.as_f64()?,
        single: commits.as_u64() == Some(1),
    })
}

/// One `sync_stopped` event's fields, or none when any is missing.
fn stop_event(event: &Map<String, Value>) -> Option<Stop> {
    let timestamp = event.get("timestamp")?.as_str()?.to_owned();
    let data = event.get("data")?.as_object()?;
    Some(Stop {
        timestamp,
        reason: data.get("reason")?.as_str()?.to_owned(),
        message: data.get("message")?.as_str()?.to_owned(),
    })
}
