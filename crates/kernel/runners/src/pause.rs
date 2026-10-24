//! Finding a usage limit and deciding how long its pause lasts.
//!
//! Implements: rust-runners/usage-limit-pause-time

mod time;

use std::time::Duration;

use osq_core::Event;
use osq_core::event::UsageLimitData;

use time::{format_timestamp_ms, parse_timestamp_ms};

/// Where a pause's end time came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PauseSource {
    /// The harness's reset time.
    Harness,
    /// The configured wait.
    Wait,
}

impl PauseSource {
    /// The source as the `paused` event and `.run/paused.md` write it.
    ///
    /// Implements: rust-runners/usage-limit-pause-time
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Harness => "harness",
            Self::Wait => "wait",
        }
    }
}

/// One pause decided from a usage limit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UsagePause {
    /// The task number, as the string it was written as.
    pub task: String,
    /// The time the task may run again.
    pub until: String,
    /// Where the pause's end time came from.
    pub source: PauseSource,
    /// The limit's error, absent without one.
    pub error: Option<String>,
}

/// The data of the last `usage_limit` event among `events`, or `None` without
/// one.
///
/// Implements: rust-runners/usage-limit-pause-time
#[must_use]
pub fn find_usage_limit(events: &[Event]) -> Option<&UsageLimitData> {
    let mut found = None;
    for event in events {
        if let Event::UsageLimit(limit) = event {
            found = Some(limit);
        }
    }
    found
}

/// The time a pause lasts until and where that time came from.
///
/// A reset time later than `now_ms` wins; otherwise the pause lasts `wait`
/// after `now_ms`. A reset time that is not in the fixed form counts as none.
///
/// Implements: rust-runners/usage-limit-pause-time
#[must_use]
pub fn pause_until(limit: &UsageLimitData, now_ms: i64, wait: Duration) -> (String, PauseSource) {
    if let Some(resets_at) = &limit.resets_at
        && let Some(reset_ms) = parse_timestamp_ms(resets_at)
        && reset_ms > now_ms
    {
        return (format_timestamp_ms(reset_ms), PauseSource::Harness);
    }
    let wait_ms = i64::try_from(wait.as_millis()).unwrap_or(i64::MAX);
    (
        format_timestamp_ms(now_ms.saturating_add(wait_ms)),
        PauseSource::Wait,
    )
}
