//! Building the events the runner itself gives for retries and pauses.

use std::time::Duration;

use osq_core::Event;
use osq_core::event::{HarnessRetryData, PausedData};

use crate::UsagePause;

/// The runner's retry start event, before it waits and starts again.
pub(super) fn retry_start(
    attempt: u32,
    max_attempts: u32,
    delay: Duration,
    error: Option<String>,
) -> Event {
    Event::HarnessRetry(HarnessRetryData {
        phase: "start".to_owned(),
        attempt: u64::from(attempt),
        max_attempts: Some(u64::from(max_attempts)),
        delay_ms: Some(u64::try_from(delay.as_millis()).unwrap_or(u64::MAX)),
        success: None,
        error,
    })
}

/// The runner's retry end event after a retried start worked.
pub(super) fn retry_end(attempt: u32, max_attempts: u32) -> Event {
    Event::HarnessRetry(HarnessRetryData {
        phase: "end".to_owned(),
        attempt: u64::from(attempt),
        max_attempts: Some(u64::from(max_attempts)),
        delay_ms: None,
        success: Some(true),
        error: None,
    })
}

/// The pause event for the usage limit one start reported.
pub(super) fn paused(pause: &UsagePause) -> Event {
    Event::Paused(PausedData {
        task: pause.task.clone(),
        until: pause.until.clone(),
        source: pause.source.as_str().to_owned(),
        error: pause.error.clone(),
    })
}
