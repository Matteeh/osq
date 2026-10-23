//! Proves reading the watcher and service records of a project's watch state.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{
    ServiceRecord, WatchState, WatcherMode, WatcherRecord, read_watch_state, watch_state_dir,
};

/// A pid no process holds.
const DEAD: u64 = 2_147_483_646;

/// A fresh temporary folder for one row, named after the test and row.
fn temp_folder(name: &str) -> PathBuf {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("reading_watch_state")
        .join(name);
    let _ = fs::remove_dir_all(&folder);
    folder
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// A service record with the row's pid.
fn service(pid: u64) -> ServiceRecord {
    ServiceRecord {
        pid,
        started_at: String::from("s"),
        log: String::from("l"),
    }
}

/// A watcher record with the row's pid, mode and waiting reason.
fn watcher(pid: u64, mode: WatcherMode, waiting: Option<&str>) -> WatcherRecord {
    WatcherRecord {
        pid,
        mode,
        version: String::from("0.3.0"),
        commit: String::from("abc1234"),
        started_at: String::from("s"),
        waiting: waiting.map(String::from),
    }
}

/// A watcher's JSON record with the row's pid, mode and waiting value.
fn watcher_json(pid: u64, mode: &str, waiting: &str) -> String {
    format!(
        r#"{{"pid":{pid},"mode":"{mode}","version":"0.3.0","commit":"abc1234","startedAt":"s","waiting":{waiting}}}"#
    )
}

/// A service's JSON record with the row's pid.
fn service_json(pid: &str) -> String {
    format!(r#"{{"pid":{pid},"startedAt":"s","log":"l"}}"#)
}

/// One row of "Watch records": its files and what they read as.
struct Row {
    /// The row's name.
    name: &'static str,
    /// The row's files and their contents.
    files: Vec<(&'static str, String)>,
    /// The expected service record.
    service: Option<ServiceRecord>,
    /// The expected watcher record.
    watcher: Option<WatcherRecord>,
    /// The expected `log_exists`.
    log_exists: bool,
}

/// Writes each row's files into a fresh watch state folder and checks the read.
fn check_rows(rows: &[Row]) {
    for row in rows {
        let state = read_row(row.name, &row.files);
        let expected = WatchState {
            service: row.service.clone(),
            watcher: row.watcher.clone(),
            log: state.log.clone(),
            log_exists: row.log_exists,
        };
        assert_eq!(state, expected, "row {}", row.name);
        assert!(
            state.log.ends_with("watch.log"),
            "row {} log is {}",
            row.name,
            state.log.display()
        );
    }
}

/// Writes a row's files into its watch state folder and reads them back.
fn read_row(name: &str, files: &[(&str, String)]) -> WatchState {
    let project = temp_folder(&format!("watch_records_{name}_project"));
    fs::create_dir_all(&project).unwrap();
    let home = temp_folder(&format!("watch_records_{name}_home"));
    fs::create_dir_all(&home).unwrap();
    let dir = watch_state_dir(&project, &home);
    for (file, text) in files {
        write(&dir.join(file), text);
    }
    read_watch_state(&project, &home)
}

/// Proves the first four rows of "Watch records".
///
/// Covers: rust-storage/watch-records
#[test]
fn watch_records_live_and_dead() {
    let live = u64::from(std::process::id());
    let rows = vec![
        Row {
            name: "none",
            files: Vec::new(),
            service: None,
            watcher: None,
            log_exists: false,
        },
        Row {
            name: "terminal",
            files: vec![("watcher.json", watcher_json(live, "terminal", "null"))],
            service: None,
            watcher: Some(watcher(live, WatcherMode::Terminal, None)),
            log_exists: false,
        },
        Row {
            name: "background",
            files: vec![
                ("service.json", service_json(&live.to_string())),
                ("watcher.json", watcher_json(live, "background", r#""w""#)),
                ("watch.log", String::from("log line\n")),
            ],
            service: Some(service(live)),
            watcher: Some(watcher(live, WatcherMode::Background, Some("w"))),
            log_exists: true,
        },
        Row {
            name: "dead",
            files: vec![("watcher.json", watcher_json(DEAD, "terminal", "null"))],
            service: None,
            watcher: None,
            log_exists: false,
        },
    ];
    check_rows(&rows);
}

/// Proves the last four rows of "Watch records".
///
/// Covers: rust-storage/watch-records
#[test]
fn watch_records_invalid_records() {
    let live = u64::from(std::process::id());
    let rows = vec![
        Row {
            name: "daemon",
            files: vec![("watcher.json", watcher_json(live, "daemon", "null"))],
            service: None,
            watcher: None,
            log_exists: false,
        },
        Row {
            name: "no_waiting",
            files: vec![(
                "watcher.json",
                format!(
                    r#"{{"pid":{live},"mode":"terminal","version":"0.3.0","commit":"abc1234","startedAt":"s"}}"#
                ),
            )],
            service: None,
            watcher: None,
            log_exists: false,
        },
        Row {
            name: "string_pid",
            files: vec![("service.json", service_json(&format!("\"{live}\"")))],
            service: None,
            watcher: None,
            log_exists: false,
        },
        Row {
            name: "not_json",
            files: vec![("service.json", String::from("not json"))],
            service: None,
            watcher: None,
            log_exists: false,
        },
    ];
    check_rows(&rows);
}

/// Proves unusable service records read no service record.
///
/// Covers: rust-storage/watch-records
#[test]
fn watch_records_bad_service() {
    let live = u64::from(std::process::id());
    let rows = [
        (
            "service_no_pid",
            String::from(r#"{"startedAt":"s","log":"l"}"#),
        ),
        (
            "service_no_started",
            format!(r#"{{"pid":{live},"log":"l"}}"#),
        ),
        (
            "service_no_log",
            format!(r#"{{"pid":{live},"startedAt":"s"}}"#),
        ),
        (
            "service_float_pid",
            String::from(r#"{"pid":1.5,"startedAt":"s","log":"l"}"#),
        ),
        (
            "service_negative_pid",
            String::from(r#"{"pid":-1,"startedAt":"s","log":"l"}"#),
        ),
        (
            "service_zero_pid",
            String::from(r#"{"pid":0,"startedAt":"s","log":"l"}"#),
        ),
        (
            "service_huge_pid",
            String::from(r#"{"pid":18446744073709551616,"startedAt":"s","log":"l"}"#),
        ),
        (
            "service_number_started",
            format!(r#"{{"pid":{live},"startedAt":5,"log":"l"}}"#),
        ),
        (
            "service_number_log",
            format!(r#"{{"pid":{live},"startedAt":"s","log":5}}"#),
        ),
        ("service_null", String::from("null")),
    ];
    check_bad("service.json", &rows);
}

/// Proves unusable watcher records read no watcher record.
///
/// Covers: rust-storage/watch-records
#[test]
fn watch_records_bad_watcher() {
    let live = u64::from(std::process::id());
    let rows = [
        (
            "watcher_no_pid",
            String::from(
                r#"{"mode":"terminal","version":"0.3.0","commit":"abc1234","startedAt":"s","waiting":null}"#,
            ),
        ),
        (
            "watcher_no_mode",
            format!(
                r#"{{"pid":{live},"version":"0.3.0","commit":"abc1234","startedAt":"s","waiting":null}}"#
            ),
        ),
        (
            "watcher_number_mode",
            format!(
                r#"{{"pid":{live},"mode":5,"version":"0.3.0","commit":"abc1234","startedAt":"s","waiting":null}}"#
            ),
        ),
        (
            "watcher_no_version",
            format!(
                r#"{{"pid":{live},"mode":"terminal","commit":"abc1234","startedAt":"s","waiting":null}}"#
            ),
        ),
        (
            "watcher_no_commit",
            format!(
                r#"{{"pid":{live},"mode":"terminal","version":"0.3.0","startedAt":"s","waiting":null}}"#
            ),
        ),
        (
            "watcher_no_started",
            format!(
                r#"{{"pid":{live},"mode":"terminal","version":"0.3.0","commit":"abc1234","waiting":null}}"#
            ),
        ),
        (
            "watcher_number_waiting",
            watcher_json(live, "terminal", "5"),
        ),
        ("watcher_array", String::from("[]")),
        ("watcher_string", String::from(r#""x""#)),
    ];
    check_bad("watcher.json", &rows);
}

/// Checks each unusable record row reads no record and no log.
fn check_bad(file: &str, rows: &[(&str, String)]) {
    for (name, text) in rows {
        let state = read_row(name, &[(file, text.clone())]);
        assert_eq!(state.service, None, "row {name} service");
        assert_eq!(state.watcher, None, "row {name} watcher");
        assert!(!state.log_exists, "row {name} log_exists");
    }
}
