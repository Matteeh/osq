//! Turning a usage limit in one start's events into the runner's pause.

use std::time::Duration;

use osq_core::Event;

use crate::{UsagePause, find_usage_limit, pause_until};

use super::events;

/// The pause and its event when one start reported a usage limit.
pub(super) fn usage_pause(
    task: &str,
    events: &[Event],
    now_ms: i64,
    wait: Duration,
) -> Option<(UsagePause, Event)> {
    let limit = find_usage_limit(events)?;
    let (until, source) = pause_until(limit, now_ms, wait);
    let pause = UsagePause {
        task: task.to_owned(),
        until,
        source,
        error: limit.error.clone(),
    };
    let event = events::paused(&pause);
    Some((pause, event))
}
