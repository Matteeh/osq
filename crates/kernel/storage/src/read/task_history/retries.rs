//! Counting the automatic and manual retry attempts of a task stream.
//!
//! Implements: rust-storage/task-history

use super::RetryGroup;
use super::stream::Event;

/// The two retry groups and the number of stuck events.
pub(super) struct Retries {
    /// The attempts opened by an automatic `retry` event.
    pub(super) automatic: RetryGroup,
    /// The attempts opened by a manual `retry` event.
    pub(super) manual: RetryGroup,
    /// The number of `stuck` events.
    pub(super) stuck: u64,
}

/// One retry group under construction and its per-attempt flags.
#[derive(Default)]
struct Group {
    /// The group's finished counts.
    history: RetryGroup,
    /// Whether the active attempt already counted a `done`.
    done_this_attempt: bool,
    /// Whether the active attempt already counted a cost.
    reported_this_attempt: bool,
}

/// Which retry group is the active attempt.
#[derive(Clone, Copy)]
enum Side {
    /// The automatic group.
    Automatic,
    /// The manual group.
    Manual,
}

/// Counts both retry groups and the stuck events in file order.
pub(super) fn count(events: &[Event]) -> Retries {
    let mut automatic = Group::default();
    let mut manual = Group::default();
    let mut stuck = 0;
    let mut active = None;
    for event in events {
        match event.kind() {
            Some("retry") => {
                let side = if event.is_true("automatic") {
                    Side::Automatic
                } else {
                    Side::Manual
                };
                let group = group(&mut automatic, &mut manual, side);
                group.history.count += 1;
                group.done_this_attempt = false;
                group.reported_this_attempt = false;
                active = Some(side);
                continue;
            }
            Some("stuck") => {
                stuck += 1;
                continue;
            }
            _ => {}
        }
        let Some(side) = active else {
            continue;
        };
        let group = group(&mut automatic, &mut manual, side);
        if event.kind() == Some("done") {
            if !group.done_this_attempt {
                group.done_this_attempt = true;
                group.history.reached_done += 1;
            }
            continue;
        }
        let Some(cost) = event.number("cost") else {
            continue;
        };
        group.history.cost += cost;
        if !group.reported_this_attempt {
            group.reported_this_attempt = true;
            group.history.cost_reported_attempts += 1;
        }
    }
    Retries {
        automatic: automatic.history,
        manual: manual.history,
        stuck,
    }
}

/// The group under construction for a retry attempt's side.
fn group<'a>(automatic: &'a mut Group, manual: &'a mut Group, side: Side) -> &'a mut Group {
    match side {
        Side::Automatic => automatic,
        Side::Manual => manual,
    }
}
