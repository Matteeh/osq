//! System clock test: its time sits between two reads and its wait elapses.

use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use osq_kernel_runners::{Clock, SystemClock};

/// Reads the system time in epoch milliseconds for the test's bounds.
fn system_ms() -> i64 {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX)
}

/// Proves the system clock reads the system time and sleeps for the wait.
///
/// Covers: rust-runners/system-clock
#[test]
fn system_clock() {
    let mut clock = SystemClock;
    let before = system_ms();
    let now = clock.now_ms();
    let after = system_ms();
    assert!(before <= now, "clock reads before the first bound");
    assert!(now <= after, "clock reads after the second bound");
    let started = Instant::now();
    clock.wait(Duration::from_millis(20));
    assert!(
        started.elapsed() >= Duration::from_millis(20),
        "the wait slept for its duration"
    );
}
