//! The watcher line and the records that wait for a human.

use std::path::{Path, PathBuf};

use osq_kernel_storage::{
    ChangeSnapshot, Location, WatchState, WatcherRecord, read_after_land_failure,
    read_autopilot_stop, read_watch_state, validator_failing,
};

use crate::facts::Facts;

use super::{id, snapshot};

/// The watcher line, the log line and every pending record.
///
/// Implements: rust-show/status-text-equals-typescript-s
pub(crate) fn lines(root: &Path, facts: &Facts) -> Vec<String> {
    let mut lines = vec![String::new()];
    let home = std::env::var_os("HOME").map(PathBuf::from);
    if let Some(home) = home.as_deref() {
        let state = read_watch_state(root, home);
        lines.push(watcher_line(&state));
        if state.log_exists {
            lines.push(format!("Log: {}", state.log.display()));
        }
        if let Some(failure) = read_after_land_failure(root, home) {
            let id = id(&failure.change);
            lines.push(format!(
                "After-land command failed for {id}: {} — osq land {id}",
                failure.command
            ));
        }
    } else {
        lines.push("Watcher: not running — osq watch --background".to_owned());
    }
    if let Some(failing) = validator_failing(&snapshots(facts)) {
        let id = id(&failing.change);
        lines.push(format!(
            "Validator {} {}× in a row, last on {id}: {} — osq show {id}",
            failing.outcome.as_str(),
            failing.runs,
            failing.error
        ));
    }
    if let Some(stop) = read_autopilot_stop(root) {
        let change = stop
            .change
            .map_or_else(String::new, |change| format!(" (change {change})"));
        lines.push(format!(
            "Autopilot stopped at {}{change}: {} — {}",
            stop.item, stop.reason, stop.command
        ));
    }
    lines
}

/// Whether a watcher runs, where and on which build.
fn watcher_line(state: &WatchState) -> String {
    if let Some(service) = &state.service {
        let head = state.watcher.as_ref().map_or_else(
            || format!("Watcher: restarting in the background, pid {}", service.pid),
            |watcher| {
                format!(
                    "Watcher: running in the background, osq v{} ({}), pid {}",
                    watcher.version, watcher.commit, service.pid
                )
            },
        );
        return with_waiting(head, state.watcher.as_ref());
    }
    if let Some(watcher) = &state.watcher {
        let head = format!(
            "Watcher: running in a terminal, osq v{} ({}), pid {}",
            watcher.version, watcher.commit, watcher.pid
        );
        return with_waiting(head, Some(watcher));
    }
    "Watcher: not running — osq watch --background".to_owned()
}

/// Appends the watcher's waiting reason when it has one.
fn with_waiting(line: String, watcher: Option<&WatcherRecord>) -> String {
    match watcher.and_then(|watcher| watcher.waiting.as_deref()) {
        Some(waiting) if !waiting.is_empty() => format!("{line}, waiting: {waiting}"),
        _ => line,
    }
}

/// The archived changes' snapshots, in listing order.
fn snapshots(facts: &Facts) -> Vec<ChangeSnapshot> {
    facts
        .entries()
        .iter()
        .filter(|entry| entry.location == Location::Archived)
        .map(snapshot::read)
        .collect()
}
