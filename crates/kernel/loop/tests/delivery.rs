//! Proves event delivery's cases, one pass, cursor files, lock and failure text.

mod delivery_support;

use std::fs::{self, OpenOptions};
use std::path::Path;

use delivery_support::{
    Behavior, Call, TestFeature, active_change, append_raw, cursor_path, dead, event_path,
    read_cursor, rejected, scratch, write_cursor, write_events, write_raw,
};
use osq_core::{Event, EventKind, Feature, Invocation, Output};
use osq_kernel_loop::{CommandRun, ReactionFailure, run_command};

/// A `seen` feature that lists `noop` and reacts to `rejected`.
fn seen() -> TestFeature {
    TestFeature::new("seen")
        .command("noop", "writes nothing", "")
        .result("noop", Ok(Output::text("")))
        .kinds(&[EventKind::Rejected])
}

/// Runs one delivery through a cloned feature and returns its recorded calls.
fn deliver(root: &Path, feature: &TestFeature) -> (CommandRun, Vec<Call>) {
    let features: Vec<Box<dyn Feature>> = vec![Box::new(feature.clone())];
    let run = run_command(&features, &Invocation::new(root, "noop", Vec::new()));
    (run, feature.recorded())
}

/// The reactions a feature recorded, without its command runs.
fn reactions(calls: &[Call]) -> Vec<&Call> {
    calls
        .iter()
        .filter(|call| matches!(call, Call::React { .. }))
        .collect()
}

/// The reasons of the `rejected` events a feature recorded, in order.
fn reasons(calls: &[Call]) -> Vec<String> {
    calls
        .iter()
        .filter_map(|call| match call {
            Call::React { event, .. } => match event.as_ref() {
                Event::Rejected(data) => Some(data.reason.clone()),
                _ => None,
            },
            Call::Run(_) => None,
        })
        .collect()
}

/// A fresh root with one active `001-a`.
fn one_change(test: &str, row: &str) -> (std::path::PathBuf, std::path::PathBuf) {
    let root = scratch(test, row);
    let change = active_change(&root, "001-a");
    (root, change)
}

/// Proves every row of the delivery-cases table.
///
/// Covers: rust-loop/delivery-cases
#[test]
fn delivery_cases() {
    no_cursor();
    same_file_twice();
    partial_last_line();
    refused_line_warning();
    rewound_cursor();
    file_names_order();
    shorter_file();
    cursor_inside_line();
}

/// Proves a change with no cursor delivers both lines and writes its size.
fn no_cursor() {
    let (root, change) = one_change("delivery_cases", "no-cursor");
    write_events(&change, "change.jsonl", &[rejected("1"), rejected("2")]);
    let feature = seen();
    let (run, calls) = deliver(&root, &feature);

    assert_eq!(run.failures.len(), 0);
    assert_eq!(run.warnings.len(), 0);
    assert_eq!(reasons(&calls), ["1", "2"]);
    let size = fs::metadata(event_path(&change, "change.jsonl"))
        .expect("the event file is read")
        .len();
    assert_eq!(
        read_cursor(&change, "seen"),
        Some(format!("{{\"change.jsonl\":{size}}}\n"))
    );
}

/// Proves a second delivery of an unchanged file calls nothing again.
fn same_file_twice() {
    let (root, change) = one_change("delivery_cases", "same-file-twice");
    write_events(&change, "change.jsonl", &[rejected("1"), rejected("2")]);
    let feature = seen();
    let (first, _) = deliver(&root, &feature);
    let (second, calls) = deliver(&root, &feature);

    assert_eq!(first.failures.len(), 0);
    assert_eq!(second.failures.len(), 0);
    assert_eq!(reasons(&calls), ["1", "2"]);
}

/// Proves an unfinished last line waits for its newline.
fn partial_last_line() {
    let (root, change) = one_change("delivery_cases", "partial-last-line");
    let first = rejected("1");
    let text = format!("{first}\n{}", rejected("2"));
    write_raw(&change, "change.jsonl", &text);
    let feature = seen();
    let (run, calls) = deliver(&root, &feature);
    let first_size = first.len() as u64 + 1;

    assert_eq!(run.failures.len(), 0);
    assert_eq!(reasons(&calls), ["1"]);
    assert_eq!(
        read_cursor(&change, "seen"),
        Some(format!("{{\"change.jsonl\":{first_size}}}\n"))
    );

    append_raw(&change, "change.jsonl", "\n");
    let (run, calls) = deliver(&root, &feature);
    assert_eq!(run.failures.len(), 0);
    assert_eq!(reasons(&calls), ["1", "2"]);
    let size = fs::metadata(event_path(&change, "change.jsonl"))
        .expect("the event file is read")
        .len();
    assert_eq!(
        read_cursor(&change, "seen"),
        Some(format!("{{\"change.jsonl\":{size}}}\n"))
    );
}

/// Proves a refused line is passed over with one warning and no failure.
fn refused_line_warning() {
    let (root, change) = one_change("delivery_cases", "refused-line-warning");
    write_events(
        &change,
        "change.jsonl",
        &["not json".to_owned(), dead(), rejected("3")],
    );
    let (run, calls) = deliver(&root, &seen());

    assert_eq!(run.failures.len(), 0);
    assert_eq!(reasons(&calls), ["3"]);
    assert_eq!(
        run.warnings,
        ["seen passed over byte 0 of change.jsonl in 001-a: line is not one JSON object"]
    );
}

/// Proves a cursor set back to zero delivers the old lines again.
fn rewound_cursor() {
    let (root, change) = one_change("delivery_cases", "rewound-cursor");
    write_events(&change, "change.jsonl", &[rejected("1"), rejected("2")]);
    let feature = seen();
    let (_, _) = deliver(&root, &feature);
    write_cursor(&change, "seen", "{\"change.jsonl\":0}\n");
    let (run, calls) = deliver(&root, &feature);

    assert_eq!(run.failures.len(), 0);
    assert_eq!(reasons(&calls), ["1", "2", "1", "2"]);
}

/// Proves event files are delivered in byte order of their names.
fn file_names_order() {
    let (root, change) = one_change("delivery_cases", "file-names-order");
    write_events(&change, "1.jsonl", &[rejected("4")]);
    write_events(&change, "change.jsonl", &[rejected("5")]);
    let (run, calls) = deliver(&root, &seen());

    assert_eq!(run.failures.len(), 0);
    assert_eq!(reasons(&calls), ["4", "5"]);
}

/// Proves a file shorter than its cursor gives one failure and no event.
fn shorter_file() {
    let (root, change) = one_change("delivery_cases", "shorter-file");
    write_events(&change, "change.jsonl", &[rejected("1")]);
    write_cursor(&change, "seen", "{\"change.jsonl\":999}\n");
    let (run, calls) = deliver(&root, &seen());

    assert_eq!(reasons(&calls).len(), 0);
    assert_eq!(run.failures.len(), 1);
    assert_eq!(
        run.failures[0].message,
        "event file change.jsonl is shorter than its cursor"
    );
    assert_eq!(
        read_cursor(&change, "seen"),
        Some("{\"change.jsonl\":999}\n".to_owned())
    );
}

/// Proves a cursor inside a line gives one failure and leaves the cursor.
fn cursor_inside_line() {
    let (root, change) = one_change("delivery_cases", "cursor-inside-line");
    write_events(&change, "change.jsonl", &[rejected("1"), rejected("2")]);
    write_cursor(&change, "seen", "{\"change.jsonl\":3}\n");
    let (run, calls) = deliver(&root, &seen());

    assert_eq!(reasons(&calls).len(), 0);
    assert_eq!(run.failures.len(), 1);
    assert_eq!(
        run.failures[0].message,
        "cursor of change.jsonl is not at a line start"
    );
    assert_eq!(
        read_cursor(&change, "seen"),
        Some("{\"change.jsonl\":3}\n".to_owned())
    );
}

/// Proves one delivery ignores an event its reaction appends until a later one.
///
/// Covers: rust-loop/one-pass
#[test]
fn one_pass() {
    let (root, change) = one_change("delivery", "one-pass");
    write_events(&change, "change.jsonl", &[rejected("first")]);
    let feature = seen().behavior(Behavior::AppendRejected("again".to_owned()));

    let (first, calls) = deliver(&root, &feature);
    assert_eq!(first.failures.len(), 0);
    assert_eq!(reactions(&calls).len(), 1);
    assert_eq!(reasons(&calls), ["first"]);

    let (second, calls) = deliver(&root, &feature);
    assert_eq!(second.failures.len(), 0);
    assert_eq!(reactions(&calls).len(), 2);
    assert_eq!(reasons(&calls), ["first", "again"]);
}

/// Proves every row of the cursor-file table.
///
/// Covers: rust-loop/cursor-files
#[test]
fn cursor_files() {
    missing_cursor_written();
    sorted_cursor_rewritten();
    invalid_cursor_fails();
    unreadable_cursor_fails();
}

/// Proves a missing cursor becomes a compact object holding the new offset.
fn missing_cursor_written() {
    let (root, change) = one_change("cursor_files", "missing");
    write_raw(&change, "change.jsonl", "notjson\nbad\n");
    let (run, calls) = deliver(&root, &seen());

    assert_eq!(run.failures.len(), 0);
    assert_eq!(reactions(&calls).len(), 0);
    assert_eq!(
        read_cursor(&change, "seen"),
        Some("{\"change.jsonl\":12}\n".to_owned())
    );
}

/// Proves a cursor's keys are sorted again when an offset moves.
fn sorted_cursor_rewritten() {
    let (root, change) = one_change("cursor_files", "sorted");
    write_raw(&change, "change.jsonl", "notjson\nbad\n");
    write_events(&change, "1.jsonl", &[rejected("4")]);
    write_cursor(&change, "seen", "{\"change.jsonl\":12,\"1.jsonl\":0}\n");
    let (run, calls) = deliver(&root, &seen());
    let one_size = fs::metadata(event_path(&change, "1.jsonl"))
        .expect("the event file is read")
        .len();

    assert_eq!(run.failures.len(), 0);
    assert_eq!(reasons(&calls), ["4"]);
    assert_eq!(
        read_cursor(&change, "seen"),
        Some(format!("{{\"1.jsonl\":{one_size},\"change.jsonl\":12}}\n"))
    );
}

/// Proves a cursor that is not an object fails and delivers nothing.
fn invalid_cursor_fails() {
    let (root, change) = one_change("cursor_files", "invalid");
    write_events(&change, "change.jsonl", &[rejected("1")]);
    write_cursor(&change, "seen", "[1]\n");
    let (run, calls) = deliver(&root, &seen());

    assert_eq!(reactions(&calls).len(), 0);
    assert_eq!(run.failures.len(), 1);
    assert_eq!(run.failures[0].feature, "seen");
    assert_eq!(run.failures[0].event, "");
    assert_eq!(run.failures[0].change, "001-a");
    assert_eq!(
        run.failures[0].message,
        "cursor .run/delivered/seen is not valid"
    );
    assert_eq!(read_cursor(&change, "seen"), Some("[1]\n".to_owned()));
}

/// Proves a cursor file that cannot be read is invalid, not absent.
fn unreadable_cursor_fails() {
    let (root, change) = one_change("cursor_files", "unreadable");
    write_events(&change, "change.jsonl", &[rejected("1")]);
    fs::create_dir_all(cursor_path(&change, "seen")).expect("the cursor path is a folder");
    let (run, calls) = deliver(&root, &seen());

    assert_eq!(reactions(&calls).len(), 0);
    assert_eq!(run.failures.len(), 1);
    assert_eq!(
        run.failures[0].message,
        "cursor .run/delivered/seen is not valid"
    );
}

/// Proves a held lock skips the change quietly until its holder drops it.
///
/// Covers: rust-loop/held-lock
#[test]
fn held_lock() {
    let (root, change) = one_change("delivery", "held-lock");
    write_events(&change, "change.jsonl", &[rejected("1")]);
    let lock_path = change.join(".run").join("delivery.lock");
    fs::create_dir_all(lock_path.parent().expect("the lock has a folder"))
        .expect("the run folder is created");
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&lock_path)
        .expect("the lock file is opened");
    lock.lock().expect("the test holds the lock");
    let feature = seen();

    let (first, calls) = deliver(&root, &feature);
    assert_eq!(first.failures.len(), 0);
    assert_eq!(first.warnings.len(), 0);
    assert_eq!(reactions(&calls).len(), 0);
    assert_eq!(read_cursor(&change, "seen"), None);

    drop(lock);
    let (second, calls) = deliver(&root, &feature);
    assert_eq!(second.failures.len(), 0);
    assert_eq!(reasons(&calls), ["1"]);
    assert!(read_cursor(&change, "seen").is_some());
}

/// Proves a lock that cannot be opened fails once and calls no reaction.
///
/// Covers: rust-loop/lock-error
#[test]
fn lock_error() {
    let (root, change) = one_change("delivery", "lock-error");
    write_events(&change, "change.jsonl", &[rejected("1")]);
    let lock_path = change.join(".run").join("delivery.lock");
    fs::create_dir_all(&lock_path).expect("the lock path is a folder");
    let (run, calls) = deliver(&root, &seen());

    assert_eq!(reactions(&calls).len(), 0);
    assert_eq!(run.warnings.len(), 0);
    assert_eq!(run.failures.len(), 1);
    let failure = &run.failures[0];
    assert_eq!(failure.feature, "delivery");
    assert_eq!(failure.event, "");
    assert_eq!(failure.change, "001-a");
    assert!(
        failure
            .message
            .starts_with("delivery lock of 001-a could not be taken: ")
    );
}

/// Proves every row of the failure-text table.
///
/// Covers: rust-loop/failure-texts
#[test]
fn failure_texts() {
    let rows = [
        (
            ReactionFailure {
                feature: "retry".to_owned(),
                event: "rejected".to_owned(),
                change: "001-a".to_owned(),
                message: "retry failed: no".to_owned(),
            },
            "retry could not handle rejected for 001-a: retry failed: no",
        ),
        (
            ReactionFailure {
                feature: "delivery".to_owned(),
                event: String::new(),
                change: "001-a".to_owned(),
                message: "delivery lock of 001-a could not be taken: no".to_owned(),
            },
            "delivery could not deliver to 001-a: delivery lock of 001-a could not be taken: no",
        ),
    ];
    for (failure, text) in rows {
        assert_eq!(failure.to_string(), text);
    }
}
