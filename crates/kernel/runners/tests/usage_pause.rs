//! Usage pause tests: the last limit wins and the table's pause times.

use std::time::Duration;

use osq_core::Event;
use osq_core::event::{TextData, ToolData, UsageLimitData};
use osq_kernel_runners::{PauseSource, find_usage_limit, pause_until};

/// One row of the "Pause times" table.
struct Row {
    /// The limit's reset time, or none.
    resets_at: Option<&'static str>,
    /// The pause's starting epoch milliseconds.
    now_ms: i64,
    /// The time the pause lasts until.
    until: &'static str,
    /// Where the pause's end time came from.
    source: PauseSource,
}

/// Builds a limit with one reset time.
fn limit(resets_at: Option<&str>) -> UsageLimitData {
    UsageLimitData {
        resets_at: resets_at.map(str::to_owned),
        error: None,
    }
}

/// Proves the last limit among the events wins.
///
/// Covers: rust-runners/last-limit-wins
#[test]
fn last_limit_wins() {
    let events = [
        Event::Text(TextData {
            text: "working".to_owned(),
        }),
        Event::UsageLimit(limit(Some("2026-10-21T13:00:00.000Z"))),
        Event::Tool(ToolData {
            tool: "read".to_owned(),
            summary: "one file".to_owned(),
        }),
        Event::UsageLimit(UsageLimitData {
            resets_at: None,
            error: Some("Monthly quota exceeded".to_owned()),
        }),
    ];
    assert_eq!(
        find_usage_limit(&events),
        Some(&UsageLimitData {
            resets_at: None,
            error: Some("Monthly quota exceeded".to_owned()),
        })
    );
    let no_limit = [
        Event::Text(TextData {
            text: "working".to_owned(),
        }),
        Event::Tool(ToolData {
            tool: "read".to_owned(),
            summary: "one file".to_owned(),
        }),
    ];
    assert_eq!(find_usage_limit(&no_limit), None);
    assert_eq!(find_usage_limit(&[]), None);
}

/// The "Pause times" table.
const ROWS: [Row; 16] = [
    Row {
        resets_at: Some("2026-10-21T13:00:00.000Z"),
        now_ms: 1_792_584_000_000,
        until: "2026-10-21T13:00:00.000Z",
        source: PauseSource::Harness,
    },
    Row {
        resets_at: Some("2026-10-21T12:00:00.001Z"),
        now_ms: 1_792_584_000_000,
        until: "2026-10-21T12:00:00.001Z",
        source: PauseSource::Harness,
    },
    Row {
        resets_at: Some("2026-10-21T12:00:00.000Z"),
        now_ms: 1_792_584_000_000,
        until: "2026-10-21T12:10:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: Some("2026-10-21T11:00:00.000Z"),
        now_ms: 1_792_584_000_000,
        until: "2026-10-21T12:10:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: None,
        now_ms: 1_792_584_000_000,
        until: "2026-10-21T12:10:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: Some("not a time"),
        now_ms: 1_792_584_000_000,
        until: "2026-10-21T12:10:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: Some("2026-10-21T13:00:00Z"),
        now_ms: 1_792_584_000_000,
        until: "2026-10-21T12:10:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: Some("2026-02-30T00:00:00.000Z"),
        now_ms: 0,
        until: "1970-01-01T00:10:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: Some("2026-13-01T00:00:00.000Z"),
        now_ms: 0,
        until: "1970-01-01T00:10:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: Some("2026-10-21T24:00:00.000Z"),
        now_ms: 0,
        until: "1970-01-01T00:10:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: Some("2026-10-21T12:60:00.000Z"),
        now_ms: 0,
        until: "1970-01-01T00:10:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: Some("2026-10-21T12:00:60.000Z"),
        now_ms: 0,
        until: "1970-01-01T00:10:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: Some("2028-02-29T00:00:00.000Z"),
        now_ms: 0,
        until: "2028-02-29T00:00:00.000Z",
        source: PauseSource::Harness,
    },
    Row {
        resets_at: None,
        now_ms: 1_792_584_000_250,
        until: "2026-10-21T12:10:00.250Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: None,
        now_ms: 1_798_761_300_000,
        until: "2027-01-01T00:05:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: None,
        now_ms: 1_835_394_900_000,
        until: "2028-02-29T00:05:00.000Z",
        source: PauseSource::Wait,
    },
];

/// Proves every row of the "Pause times" table.
///
/// Covers: rust-runners/pause-times
#[test]
fn pause_times() {
    for (index, row) in ROWS.iter().enumerate() {
        let (until, source) =
            pause_until(&limit(row.resets_at), row.now_ms, Duration::from_secs(600));
        assert_eq!(until, row.until, "pause row {index} until");
        assert_eq!(source, row.source, "pause row {index} source");
        let source_text = match source {
            PauseSource::Harness => "harness",
            PauseSource::Wait => "wait",
        };
        assert_eq!(source.as_str(), source_text, "pause row {index} as_str");
    }
}

/// The boundary rows around the parser and the date conversion.
const EDGE_ROWS: [Row; 13] = [
    Row {
        resets_at: Some("2026-02-29T00:00:00.000Z"),
        now_ms: 0,
        until: "1970-01-01T00:10:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: Some("2026-04-31T00:00:00.000Z"),
        now_ms: 0,
        until: "1970-01-01T00:10:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: Some("2026-00-01T00:00:00.000Z"),
        now_ms: 0,
        until: "1970-01-01T00:10:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: Some("2026-01-00T00:00:00.000Z"),
        now_ms: 0,
        until: "1970-01-01T00:10:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: Some("2000-02-29T00:00:00.000Z"),
        now_ms: 0,
        until: "2000-02-29T00:00:00.000Z",
        source: PauseSource::Harness,
    },
    Row {
        resets_at: Some("1900-02-28T00:00:00.000Z"),
        now_ms: i64::MIN,
        until: "1900-02-28T00:00:00.000Z",
        source: PauseSource::Harness,
    },
    Row {
        resets_at: Some("1970-01-01T00:00:00.001Z"),
        now_ms: 0,
        until: "1970-01-01T00:00:00.001Z",
        source: PauseSource::Harness,
    },
    Row {
        resets_at: Some("2027-01-01T00:00:00.000Z"),
        now_ms: 0,
        until: "2027-01-01T00:00:00.000Z",
        source: PauseSource::Harness,
    },
    Row {
        resets_at: Some("2026-02-28T00:00:00.000Z"),
        now_ms: 0,
        until: "2026-02-28T00:00:00.000Z",
        source: PauseSource::Harness,
    },
    Row {
        resets_at: Some("2026-10-31T00:00:00.000Z"),
        now_ms: 0,
        until: "2026-10-31T00:00:00.000Z",
        source: PauseSource::Harness,
    },
    Row {
        resets_at: Some("2100-02-29T00:00:00.000Z"),
        now_ms: 0,
        until: "1970-01-01T00:10:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: Some("2026-10-21T13:00:00.000ZZ"),
        now_ms: 0,
        until: "1970-01-01T00:10:00.000Z",
        source: PauseSource::Wait,
    },
    Row {
        resets_at: Some("2026/10/21T13:00:00.000Z"),
        now_ms: 0,
        until: "1970-01-01T00:10:00.000Z",
        source: PauseSource::Wait,
    },
];

/// Proves the day and year bounds around the leap-year rule and the civil-date
/// conversion in both directions.
///
/// Covers: rust-runners/pause-times
#[test]
fn pause_time_edges() {
    for (index, row) in EDGE_ROWS.iter().enumerate() {
        let (until, source) =
            pause_until(&limit(row.resets_at), row.now_ms, Duration::from_secs(600));
        assert_eq!(until, row.until, "edge row {index} until");
        assert_eq!(source, row.source, "edge row {index} source");
    }
}

/// Proves the fixed time form parses and formats every civil day and the
/// boundaries of each time field.
///
/// Covers: rust-runners/pause-times
#[test]
fn pause_time_form_round_trips() {
    for year in [1900, 1970, 2000, 2026, 2027, 2028] {
        for month in 1..=12 {
            let days = match month {
                1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
                4 | 6 | 9 | 11 => 30,
                _ if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
                _ => 28,
            };
            for day in [1, days] {
                for hour in [0, 23] {
                    for minute in [0, 59] {
                        for second in [0, 59] {
                            for millis in [0, 1, 999] {
                                let text = format!(
                                    "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z"
                                );
                                let now = if year <= 1970 { i64::MIN } else { 0 };
                                let (until, source) =
                                    pause_until(&limit(Some(&text)), now, Duration::from_secs(600));
                                assert_eq!(until, text);
                                assert_eq!(source, PauseSource::Harness);
                            }
                        }
                    }
                }
            }
        }
    }
}
