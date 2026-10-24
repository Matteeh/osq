//! Collecting a task stream's finite costs and the attempts that reported one.
//!
//! Implements: rust-storage/task-history

use super::stream::Event;

/// The cost values in file order and the attempts that reported one.
pub(super) struct Costs {
    /// Every finite event cost, in file order.
    pub(super) values: Vec<f64>,
    /// The `started`-opened attempts holding at least one cost.
    pub(super) reported_attempts: u64,
}

/// Collects every finite cost and counts the attempts that reported one.
pub(super) fn collect(events: &[Event]) -> Costs {
    let mut values = Vec::new();
    let mut reported_attempts = 0;
    let mut started = false;
    let mut reported = false;
    for event in events {
        if event.kind() == Some("started") {
            started = true;
            reported = false;
        }
        let Some(cost) = event.number("cost") else {
            continue;
        };
        values.push(cost);
        if started && !reported {
            reported = true;
            reported_attempts += 1;
        }
    }
    Costs {
        values,
        reported_attempts,
    }
}
