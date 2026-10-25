//! Proves the UTC text every sync event's timestamp uses.

#[path = "../src/time.rs"]
mod time;

use std::time::{SystemTime, UNIX_EPOCH};

/// Proves the fixed UTC form across era, leap-year and month edges.
///
/// Covers: rust-sync/stopped-event-appended
#[test]
fn utc_text_for_fixed_times() {
    let rows: [(i64, &str); 16] = [
        (-62_162_121_600_000, "0000-02-29T00:00:00.000Z"),
        (-62_162_035_200_001, "0000-02-29T23:59:59.999Z"),
        (-62_162_035_200_000, "0000-03-01T00:00:00.000Z"),
        (-62_135_596_800_000, "0001-01-01T00:00:00.000Z"),
        (-59_006_316_303_211, "0100-03-01T12:34:56.789Z"),
        (-49_539_254_400_001, "0400-02-29T23:59:59.999Z"),
        (-11_670_998_400_000, "1600-02-29T00:00:00.000Z"),
        (-1, "1969-12-31T23:59:59.999Z"),
        (0, "1970-01-01T00:00:00.000Z"),
        (951_804_428_009, "2000-02-29T06:07:08.009Z"),
        (1_709_208_000_000, "2024-02-29T12:00:00.000Z"),
        (1_735_689_599_999, "2024-12-31T23:59:59.999Z"),
        (1_735_689_600_000, "2025-01-01T00:00:00.000Z"),
        (1_792_231_200_000, "2026-10-17T10:00:00.000Z"),
        (13_574_563_200_000, "2400-02-29T00:00:00.000Z"),
        (253_402_300_799_999, "9999-12-31T23:59:59.999Z"),
    ];
    for (ms, expected) in rows {
        assert_eq!(time::format_utc(ms), expected, "{ms}");
    }
    let before = elapsed_ms();
    let now = time::now_ms();
    let after = elapsed_ms();
    assert!(before <= now && now <= after, "the clock is UTC now");
}

/// The current time as epoch milliseconds, for the clock's bounds.
fn elapsed_ms() -> i64 {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("the clock is after the epoch");
    i64::try_from(elapsed.as_millis()).expect("the time fits in i64")
}
