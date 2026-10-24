//! Counting attempts and unexplained re-runs in a task stream.
//!
//! Implements: rust-storage/task-history

use super::stream::Event;

/// The attempt count and the started events not separated by a death or regression.
pub(super) struct Attempts {
    /// The number of `started` events.
    pub(super) total: u64,
    /// The `started` events that follow an unexplained earlier one.
    pub(super) unexplained: u64,
}

/// Counts attempts and unexplained re-runs in file order.
pub(super) fn count(events: &[Event]) -> Attempts {
    let mut total = 0;
    let mut unexplained = 0;
    let mut started = false;
    let mut explained = true;
    for event in events {
        match event.kind() {
            Some("started") => {
                total += 1;
                if started && !explained {
                    unexplained += 1;
                }
                started = true;
                explained = false;
            }
            Some("dead" | "regressed") => explained = true,
            _ => {}
        }
    }
    Attempts { total, unexplained }
}
