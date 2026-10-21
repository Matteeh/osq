//! Reading the clock and waiting, behind the runner's clock port.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// The time source and waiting the runner uses.
pub trait Clock {
    /// The current epoch time in milliseconds.
    ///
    /// Implements: rust-runners/start-retries
    fn now_ms(&self) -> i64;

    /// Waits for `duration`.
    ///
    /// Implements: rust-runners/start-retries
    fn wait(&mut self, duration: Duration);
}

/// The clock that reads the system time and sleeps the current thread.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    /// Reads the system time since the epoch in milliseconds.
    ///
    /// Implements: rust-runners/start-retries
    fn now_ms(&self) -> i64 {
        let elapsed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX)
    }

    /// Sleeps the current thread for `duration`.
    ///
    /// Implements: rust-runners/start-retries
    fn wait(&mut self, duration: Duration) {
        std::thread::sleep(duration);
    }
}
