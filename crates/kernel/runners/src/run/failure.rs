//! Judging one start from its exit and the events the harness gave.

use osq_core::Event;
use osq_core::event::HarnessRetryData;

use super::{HarnessExit, StartError};

/// Why one start failed, with the error the retry event and outcome carry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct StartFailure {
    /// The failure's message, absent when the harness reported none.
    pub(super) error: Option<String>,
}

/// The harness retry the provider never answered, if any.
struct OpenRetry {
    /// The error on the latest open retry start.
    error: Option<String>,
}

/// Judges one start: its exit on success, or the failure that starts a retry.
///
/// A start error always fails. A non-zero exit or a timeout fails only while
/// the harness's own retry start stayed open, as a provider outage does.
pub(super) fn judge_start(
    end: &Result<HarnessExit, StartError>,
    events: &[Event],
) -> Result<HarnessExit, StartFailure> {
    match end {
        Err(error) => Err(StartFailure {
            error: Some(error.message.clone()),
        }),
        Ok(exit) => {
            if exit.exit_code == 0 && !exit.timed_out {
                return Ok(exit.clone());
            }
            open_retry(events).map_or_else(
                || Ok(exit.clone()),
                |retry| Err(StartFailure { error: retry.error }),
            )
        }
    }
}

/// The latest retry start after the last successful retry end.
fn open_retry(events: &[Event]) -> Option<OpenRetry> {
    let mut open = None;
    for event in events {
        match event {
            Event::HarnessRetry(data) if is_successful_end(data) => open = None,
            Event::HarnessRetry(data) if is_start(data) => {
                open = Some(OpenRetry {
                    error: data.error.clone(),
                });
            }
            _ => {}
        }
    }
    open
}

/// Whether an event is a retry start.
fn is_start(data: &HarnessRetryData) -> bool {
    data.phase == "start"
}

/// Whether an event ends the open retry successfully.
fn is_successful_end(data: &HarnessRetryData) -> bool {
    data.phase == "end" && data.success == Some(true)
}
