//! Proves the pure epoch-millisecond to UTC timestamp conversion.

#[path = "../src/reject/time.rs"]
mod time;

use osq_kernel_storage::timestamp_ms;

/// The last day of `month` in `year`.
fn last_day(year: i64, month: i64) -> i64 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        _ => 28,
    }
}

/// Proves every civil date field and every time-of-day field of the conversion.
///
/// Covers: rust-approve/rejection-files
#[test]
fn rejection_time_conversion() {
    let years = [
        1, 1600, 1900, 1970, 2000, 2024, 2026, 2027, 2028, 2100, 2400, 9999,
    ];
    for year in years {
        for month in 1..=12 {
            for day in [1, last_day(year, month)] {
                for hour in [0, 23] {
                    for minute in [0, 59] {
                        for second in [0, 59] {
                            for millis in [0, 1, 999] {
                                let expected = format!(
                                    "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z"
                                );
                                let epoch = timestamp_ms(&expected)
                                    .unwrap_or_else(|| panic!("{expected} parses"));
                                assert_eq!(
                                    time::format_millis(epoch),
                                    expected,
                                    "{expected} round trips"
                                );
                            }
                        }
                    }
                }
            }
        }
    }
}

/// Proves that an epoch before 1970 keeps its date below zero, and that the
/// current-clock conversion gives a readable timestamp.
///
/// Covers: rust-approve/rejection-files
#[test]
fn rejection_time_before_the_epoch() {
    assert!(
        timestamp_ms(&time::now()).is_some(),
        "the current clock gives a timestamp"
    );
    for expected in [
        "1969-12-31T23:59:59.999Z",
        "1969-07-20T20:17:40.000Z",
        "1900-01-01T00:00:00.000Z",
    ] {
        let epoch = timestamp_ms(expected).expect("the timestamp parses");
        assert_eq!(
            time::format_millis(epoch),
            expected,
            "{expected} round trips"
        );
    }
}
