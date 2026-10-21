//! Proves the prompt's repository record section and an unreadable archive.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_plan::PlanFeature;

/// The one-item queue every row uses.
const QUEUE: &str = "## [a] A\n\nDepends on: nothing\n\nA.\n";

/// The fixed time whose UTC date the brief records.
const TIME: i64 = 1_792_584_000_000;

/// The body for a window with too few measured tasks.
const TOO_SMALL: &str = "This repository's measured record is too small (fewer than 5 tasks).";

/// Creates a scratch root for one row, removing any left-over folder.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Writes one file under a base folder, creating its parent folders.
fn write(path: &Path, text: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the file's parent is created");
    }
    fs::write(path, text).expect("the file is written");
}

/// One event line with the given type, timestamp and data.
fn event(kind: &str, timestamp: &str, data: &str) -> String {
    format!("{{\"type\":\"{kind}\",\"timestamp\":\"{timestamp}\",\"data\":{{{data}}}}}\n")
}

/// One `measures` line with the given phase, scope files and resolver.
fn measures(phase: &str, timestamp: &str, files: u64, resolver: Option<u64>) -> String {
    let resolver = resolver.map_or_else(String::new, |value| format!(",\"scopeResolver\":{value}"));
    event(
        "measures",
        timestamp,
        &format!(
            "\"phase\":\"{phase}\",\"scopeFiles\":{files},\"scopeLines\":1,\"repoFiles\":1,\
             \"repoLines\":1,\"importFanIn\":0,\"proposalWords\":1,\"taskWords\":1,\
             \"deltaRequirements\":1,\"deltaScenarios\":1{resolver}"
        ),
    )
}

/// One task's stream: a start measure, a start, an optional end and a done.
fn events(
    task: u64,
    passing: bool,
    files: u64,
    resolver: Option<u64>,
    duration: Option<u64>,
) -> String {
    let mut text = measures("start", "2026-10-01T08:00:00.000Z", files, resolver);
    text.push_str(&event(
        "started",
        "2026-10-01T08:00:01.000Z",
        "\"attempt\":1",
    ));
    if let Some(seconds) = duration {
        let timestamp = format!("2026-10-01T08:{:02}:{:02}.000Z", seconds / 60, seconds % 60);
        text.push_str(&measures("end", &timestamp, files, resolver));
    }
    if passing {
        text.push_str(&event(
            "done",
            "2026-10-01T08:11:00.000Z",
            &format!("\"task\":\"{task}\""),
        ));
    }
    text
}

/// One `dead` event of a task stream.
fn dead_event(task: u64, reason: &str) -> String {
    event(
        "dead",
        "2026-10-01T08:11:00.000Z",
        &format!("\"task\":\"{task}\",\"reason\":\"{reason}\""),
    )
}

/// One `measures` end line that carries a scope hash object of the given size.
fn hashed_end(timestamp: &str, files: u64, paths: usize) -> String {
    let hashes: Vec<String> = (0..paths)
        .map(|index| {
            format!("\"src/{index}.rs\":{{\"before\":\"sha256:00\",\"after\":\"sha256:00\"}}")
        })
        .collect();
    event(
        "measures",
        timestamp,
        &format!(
            "\"phase\":\"end\",\"scopeFiles\":{files},\"scopeLines\":1,\"repoFiles\":1,\
             \"repoLines\":1,\"importFanIn\":0,\"proposalWords\":1,\"taskWords\":1,\
             \"deltaRequirements\":1,\"deltaScenarios\":1,\"scopeHashes\":{{{}}}",
            hashes.join(",")
        ),
    )
}

/// Writes one archived change's task file and its event stream.
fn archive_task(
    root: &Path,
    change: &str,
    task: u64,
    title: &str,
    acceptance: usize,
    stream: &str,
) {
    let base = root.join("openspec/changes/archive").join(change);
    let lines = "- [ ] Done.\n".repeat(acceptance);
    let file =
        format!("---\ntitle: \"{title}\"\nverify: node verify.cjs\n---\n\n## Acceptance\n{lines}");
    write(&base.join(format!("tasks/{task}.md")), &file);
    write(&base.join(format!(".run/events/{task}.jsonl")), stream);
}

/// The new change folder's `plan-prompt.md`.
fn new_prompt(root: &Path) -> String {
    let changes = root.join("openspec").join("changes");
    let folder = fs::read_dir(&changes)
        .expect("the changes folder reads")
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            path.is_dir()
                && path
                    .file_name()
                    .is_some_and(|name| name != "archive" && name != "rejected")
        })
        .expect("the new change folder exists");
    fs::read_to_string(folder.join("plan-prompt.md")).expect("the prompt reads")
}

/// The body of the prompt's `## This repository's record` section.
fn record_body(root: &Path) -> String {
    let prompt = new_prompt(root);
    let marker = "## This repository's record\n\n";
    let start = prompt.find(marker).expect("the record section exists") + marker.len();
    let rest = &prompt[start..];
    match rest.find("\n\n## ") {
        Some(end) => rest[..end].to_owned(),
        None => rest.to_owned(),
    }
}

/// Runs `plan --next` at the fixed time on a root with the one-item queue.
fn run(root: &Path) {
    write(&root.join("openspec/queue.md"), QUEUE);
    PlanFeature::at(TIME)
        .run(&Invocation::new(root, "plan", vec!["--next".to_owned()]))
        .unwrap_or_else(|error| panic!("{}", error));
}

/// Adds no archived change.
fn no_archive(_root: &Path) {}

/// Adds four measured tasks that all pass.
fn four_measured(root: &Path) {
    for task in 1..=4 {
        let stream = events(task, true, 2, None, None);
        archive_task(root, "001-a", task, &format!("T{task}"), 1, &stream);
    }
}

/// Adds five measured legacy tasks that never pass and never measure an end.
fn five_without_passes(root: &Path) {
    for task in 1..=5 {
        let stream = events(task, false, 9, None, None);
        archive_task(root, "001-a", task, &format!("T{task}"), 1, &stream);
    }
}

/// Adds the five tasks of the largest-pass row.
fn five_mixed(root: &Path) {
    archive_task(
        root,
        "001-a",
        1,
        "T1",
        1,
        &events(1, true, 9, None, Some(30)),
    );
    archive_task(
        root,
        "001-a",
        2,
        "T2",
        2,
        &events(2, true, 9, None, Some(90)),
    );
    let mut mixed = measures("start", "2026-10-01T08:00:00.000Z", 9, Some(2));
    mixed.push_str(&event(
        "started",
        "2026-10-01T08:00:01.000Z",
        "\"attempt\":1",
    ));
    mixed.push_str(&hashed_end("2026-10-01T08:10:00.000Z", 9, 1));
    mixed.push_str(&event("done", "2026-10-01T08:11:00.000Z", "\"task\":\"3\""));
    archive_task(root, "001-a", 3, "T3", 2, &mixed);
    let mut dead = events(4, false, 9, None, None);
    dead.push_str(&dead_event(4, "verify_red"));
    archive_task(root, "001-a", 4, "T4", 1, &dead);
    archive_task(root, "001-a", 5, "T5", 1, &events(5, false, 9, None, None));
}

/// Adds five measured legacy tasks whose shortest four measure one to four seconds.
fn five_with_durations(root: &Path) {
    for (task, duration) in [
        (1, Some(1)),
        (2, Some(2)),
        (3, Some(3)),
        (4, Some(4)),
        (5, None),
    ] {
        let stream = events(task, true, 2, None, duration);
        archive_task(root, "001-a", task, &format!("T{task}"), 1, &stream);
    }
}

/// Adds 21 changes whose one task dies, with twelve dead events in the newest.
fn twenty_one_changes(root: &Path) {
    for number in 1..=21 {
        let change = format!("{number:03}-a");
        let mut stream = events(1, false, 1, None, None);
        let deads = if number == 21 { 12 } else { 1 };
        for _ in 0..deads {
            stream.push_str(&dead_event(1, "timeout"));
        }
        archive_task(root, &change, 1, "T1", 1, &stream);
    }
}

/// The body of the 21-changes row.
fn twenty_one_body() -> String {
    let mut body = String::from(
        "First-attempt passes: 0/20\nLargest first-attempt pass: unavailable\n\
         Median task duration: unavailable\nDead outcomes:",
    );
    for _ in 0..10 {
        body.push_str("\n- 021-a, T1, timeout");
    }
    body
}

/// Proves every row of "Repository record bodies".
///
/// Covers: rust-plan/repository-record-bodies
#[test]
fn repository_record_bodies() {
    type Setup = fn(&Path);
    let rows: [(&str, Setup, String); 6] = [
        ("none", no_archive, String::from(TOO_SMALL)),
        (
            "four measured tasks",
            four_measured,
            String::from(TOO_SMALL),
        ),
        (
            "five without passes",
            five_without_passes,
            String::from(
                "First-attempt passes: 0/5\nLargest first-attempt pass: unavailable\n\
                 Median task duration: unavailable\nDead outcomes:\n  (none)",
            ),
        ),
        (
            "five mixed",
            five_mixed,
            String::from(
                "First-attempt passes: 3/5\nLargest first-attempt pass: 001-a/3 \"T3\" \
                 (scope files: 1, acceptance lines: 2) [resolver 2 scope]\n\
                 Median task duration: 1m 30s\nDead outcomes:\n- 001-a, T4, verify_red",
            ),
        ),
        (
            "five with durations",
            five_with_durations,
            String::from(
                "First-attempt passes: 5/5\nLargest first-attempt pass: 001-a/1 \"T1\" \
                 (scope files: 2, acceptance lines: 1) [legacy scope]\n\
                 Median task duration: 3s\nDead outcomes:\n  (none)",
            ),
        ),
        ("twenty one changes", twenty_one_changes, twenty_one_body()),
    ];
    for (name, setup, expected) in rows {
        let root = scratch(&format!("prompt_record/{}", name.replace(' ', "_")));
        setup(&root);
        run(&root);
        assert_eq!(record_body(&root), expected, "row {name}");
    }
}

/// Proves an archive whose event line is not JSON fails before any write.
///
/// Covers: rust-plan/archive-that-cannot-be-read
#[test]
fn archive_that_cannot_be_read() {
    let root = scratch("prompt_record/unreadable");
    write(
        &root.join("openspec/changes/archive/001-x/.run/events/1.jsonl"),
        "not json\n",
    );
    write(&root.join("openspec/queue.md"), QUEUE);
    let error = PlanFeature::at(TIME)
        .run(&Invocation::new(&root, "plan", vec!["--next".to_owned()]))
        .expect_err("the unreadable archive fails the plan");
    assert!(
        error.to_string().contains("Cannot read the archive: "),
        "row unreadable archive names the failure: {error}"
    );
    let changes = root.join("openspec").join("changes");
    let created = fs::read_dir(changes)
        .expect("the changes folder reads")
        .flatten()
        .any(|entry| entry.file_name() != "archive" && entry.file_name() != "rejected");
    assert!(!created, "row unreadable archive writes no new folder");
}

/// Proves the median's even mean and its whole-minute duration forms.
///
/// Covers: rust-plan/repository-record-bodies
#[test]
fn median_edges() {
    let cases: [(&str, [Option<u64>; 5], &str); 2] = [
        ("even mean", [Some(1), Some(10), None, None, None], "6s"),
        ("whole minute", [Some(60), None, None, None, None], "1m"),
    ];
    for (name, durations, expected) in cases {
        let root = scratch(&format!("prompt_record/{}", name.replace(' ', "_")));
        for (index, duration) in durations.into_iter().enumerate() {
            let task = u64::try_from(index + 1).unwrap_or_default();
            let stream = events(task, true, 2, None, duration);
            archive_task(&root, "001-a", task, &format!("T{task}"), 1, &stream);
        }
        run(&root);
        let body = record_body(&root);
        let line = body
            .lines()
            .find(|line| line.starts_with("Median task duration: "))
            .expect("the record names a median duration");
        assert_eq!(
            line,
            format!("Median task duration: {expected}"),
            "row {name}"
        );
    }
}

/// Proves a tied largest pass picks the lower number, not the lower text.
///
/// Covers: rust-plan/repository-record-bodies
#[test]
fn largest_numeric_order() {
    let root = scratch("prompt_record/largest_numeric_order");
    for change in ["10-a", "9-a", "011-a", "012-a", "013-a"] {
        let stream = events(1, true, 2, None, None);
        archive_task(&root, change, 1, "T1", 1, &stream);
    }
    run(&root);
    let body = record_body(&root);
    let line = body
        .lines()
        .find(|line| line.starts_with("Largest first-attempt pass: "))
        .expect("the record names a largest pass");
    assert_eq!(
        line,
        "Largest first-attempt pass: 9-a/1 \"T1\" (scope files: 2, acceptance lines: 1) [legacy scope]",
        "row largest numeric order"
    );
}
