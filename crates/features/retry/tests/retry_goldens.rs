//! Proves retry against the goldens TypeScript printed for the fixture.

mod support;

#[path = "../src/retry/time.rs"]
mod source_time;

use std::fs;
use std::process;
use std::time::{SystemTime, UNIX_EPOCH};

use support::{
    STALE_PID, change_folder, dump, failed_message, fixture, parse_golden, run, scratch_copy, write,
};

/// One row of "Retry equals TypeScript's".
struct Row {
    /// The row's golden name and scratch folder name.
    name: &'static str,
    /// The change folder the row runs in.
    folder: &'static str,
    /// The two literal retry arguments.
    args: [&'static str; 2],
    /// The running marker's task and kind, when the row writes one.
    pid: Option<(&'static str, &'static str)>,
}

/// Every row of "Retry equals TypeScript's", in the requirement's table order.
const ROWS: [Row; 20] = [
    Row {
        name: "dead-001",
        folder: "001-dead",
        args: ["1", "1"],
        pid: None,
    },
    Row {
        name: "padded-001",
        folder: "001-dead",
        args: ["001", " 1 "],
        pid: None,
    },
    Row {
        name: "history-002",
        folder: "002-history",
        args: ["2", "1"],
        pid: None,
    },
    Row {
        name: "change-003",
        folder: "003-change-regressed",
        args: ["3", "change"],
        pid: None,
    },
    Row {
        name: "change-003-task",
        folder: "003-change-regressed",
        args: ["3", "1"],
        pid: None,
    },
    Row {
        name: "regressed-004",
        folder: "004-task-regressed",
        args: ["004", "2"],
        pid: None,
    },
    Row {
        name: "both-005",
        folder: "005-dead-and-regressed",
        args: ["005-dead-and-regressed", "1"],
        pid: None,
    },
    Row {
        name: "unapproved-006",
        folder: "006-unapproved",
        args: ["6", "1"],
        pid: None,
    },
    Row {
        name: "stale-007",
        folder: "007-stale",
        args: ["7", "1"],
        pid: None,
    },
    Row {
        name: "healthy-008",
        folder: "008-healthy",
        args: ["8", "1"],
        pid: None,
    },
    Row {
        name: "healthy-008-change",
        folder: "008-healthy",
        args: ["8", "change"],
        pid: None,
    },
    Row {
        name: "running-live-009",
        folder: "009-running",
        args: ["9", "1"],
        pid: Some(("1", "live")),
    },
    Row {
        name: "running-stale-009",
        folder: "009-running",
        args: ["9", "1"],
        pid: Some(("1", "stale")),
    },
    Row {
        name: "running-garbage-009",
        folder: "009-running",
        args: ["9", "1"],
        pid: Some(("1", "garbage")),
    },
    Row {
        name: "running-change-009",
        folder: "009-running",
        args: ["9", "change"],
        pid: Some(("1", "live")),
    },
    Row {
        name: "running-other-009",
        folder: "009-running",
        args: ["9", "1"],
        pid: Some(("2", "live")),
    },
    Row {
        name: "scope-plain-010",
        folder: "010-scope-plain",
        args: ["10", "1"],
        pid: None,
    },
    Row {
        name: "blank-reason-013",
        folder: "013-blank-reason",
        args: ["13", "1"],
        pid: None,
    },
    Row {
        name: "bad-target",
        folder: "001-dead",
        args: ["1", "x"],
        pid: None,
    },
    Row {
        name: "not-found",
        folder: "001-dead",
        args: ["99", "1"],
        pid: None,
    },
];

/// Writes the row's running marker into a copied change folder.
fn write_running(root: &std::path::Path, row: &Row) {
    let Some((task, kind)) = row.pid else {
        return;
    };
    let text = if kind == "live" {
        format!(
            "{{\"pid\":{},\"startedAt\":1759395600000}}\n",
            process::id()
        )
    } else if kind == "stale" {
        format!("{{\"pid\":{STALE_PID},\"startedAt\":1759395600000}}\n")
    } else {
        "not json\n".to_owned()
    };
    write(
        root,
        &format!("openspec/changes/{}/.run/running/{task}.pid", row.folder),
        text,
    );
}

/// Compares one row's result and `.run` tree with its golden.
fn check_row(row: &Row) {
    let root = scratch_copy("retry_goldens", row.name);
    write_running(&root, row);
    let folder = change_folder(&root, row.folder);
    let result = run(&root, row.args);
    let golden = fixture("golden").join(format!("{}.txt", row.name));
    let text = fs::read_to_string(golden).expect("the golden reads");
    let (outcome, body, tree) = parse_golden(&text);
    let root_text = root.display().to_string();
    match (outcome.as_str(), result) {
        ("output", Ok(output)) => assert_eq!(output.text, body, "{}: output", row.name),
        ("failed", Err(error)) => {
            let message = failed_message(error).replace(&root_text, "<root>");
            assert_eq!(format!("{message}\n"), body, "{}: message", row.name);
        }
        (expected, actual) => panic!("{}: expected {expected}, got {actual:?}", row.name),
    }
    assert_eq!(format!("{}\n", dump(&folder)), tree, "{}: tree", row.name);
}

/// Proves every row of "Retry equals TypeScript's".
///
/// Covers: rust-retry/retry-equals-typescript-s
#[test]
fn retry_equals_typescript() {
    for row in &ROWS {
        check_row(row);
    }
}

/// Proves the fixed UTC form across era, leap-year and month edges.
///
/// Covers: rust-retry/retry-equals-typescript-s
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
        assert_eq!(source_time::format_utc(ms), expected, "{ms}");
    }
    let before = elapsed_ms();
    let now = source_time::now_ms();
    let after = elapsed_ms();
    assert!(before <= now && now <= after, "the clock is UTC now");
}

/// The current time as epoch milliseconds, for the clock's bounds.
fn elapsed_ms() -> i64 {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("the clock is after the epoch");
    i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX)
}
