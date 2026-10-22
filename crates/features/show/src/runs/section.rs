//! One task's run-history lines.
//!
//! Implements: rust-show/show-text

mod dependencies;
mod focused;
mod instructions;
mod mutation;
mod pre_spawn;
mod retries;
mod stuck;
mod values;

use crate::model::{Change, Task};

/// One task's run lines: pre-spawn verify, retries, stuck, changed
/// instructions, dependencies, focused and mutation runs.
pub(crate) fn task_lines(change: &Change, task: &Task) -> Vec<String> {
    let events = crate::events::read(change);
    let events = events.for_task(&task.number);
    let mut lines = Vec::new();
    if let Some(line) = pre_spawn::line(events) {
        lines.push(line);
    }
    if let Some(line) = retries::line(events) {
        lines.push(line);
    }
    if let Some(line) = stuck::line(events) {
        lines.push(line);
    }
    if let Some(line) = instructions::line(events) {
        lines.push(line);
    }
    if let Some(line) = dependencies::line(events) {
        lines.push(line);
    }
    if let Some(line) = focused::line(events) {
        lines.push(line);
    }
    lines.extend(mutation::lines(events));
    lines
}
