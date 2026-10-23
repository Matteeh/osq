//! Proves the record, history and disclosures sections take their sizes from
//! `osq.toml`.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_plan::PlanFeature;

/// The one-item queue every row uses.
const QUEUE: &str = "## [a] A\n\nDepends on: nothing\n\nA.\n";

/// The fixed time whose UTC date the brief records.
const TIME: i64 = 1_792_584_000_000;

/// The sentence above the quoted disclosures.
const CLAIM: &str = "Executor claims from result files, not verified facts. Check them against the code before relying on them.";

/// The marker that ends a cut disclosure.
const TRUNCATION: &str = "[truncated]";

/// The record body without a largest pass or a duration.
const UNMEASURED: &str = "Largest first-attempt pass: unavailable\n\
                          Median task duration: unavailable";

/// One history row's check on the section body.
type Check = fn(Option<String>) -> bool;

/// Creates a scratch root for one row, removing any left-over folder.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("prompt_config")
        .join(name);
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
fn events(task: u64, passing: bool, files: u64, duration: Option<u64>) -> String {
    let mut text = measures("start", "2026-10-01T08:00:00.000Z", files, None);
    text.push_str(&event(
        "started",
        "2026-10-01T08:00:01.000Z",
        "\"attempt\":1",
    ));
    if let Some(seconds) = duration {
        let timestamp = format!("2026-10-01T08:{:02}:{:02}.000Z", seconds / 60, seconds % 60);
        text.push_str(&measures("end", &timestamp, files, None));
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

/// Writes one archived change's task file and its event stream.
fn archive_task(root: &Path, change: &str, task: u64, stream: &str) {
    let base = root.join("openspec/changes/archive").join(change);
    let file = format!(
        "---\ntitle: \"T{task}\"\nverify: node verify.cjs\n---\n\n## Acceptance\n- [ ] Done.\n"
    );
    write(&base.join(format!("tasks/{task}.md")), &file);
    write(&base.join(format!(".run/events/{task}.jsonl")), stream);
}

/// Writes one archived change's result file.
fn result(root: &Path, change: &str, task: u64, text: &str) {
    let path = root
        .join("openspec/changes/archive")
        .join(change)
        .join(format!(".run/results/{task}.md"));
    write(&path, text);
}

/// Writes the root's `osq.toml`.
fn config(root: &Path, text: &str) {
    write(&root.join("osq.toml"), text);
}

/// Runs `plan --next` at the fixed time and reads the new prompt.
fn prompt(root: &Path) -> String {
    write(&root.join("openspec/queue.md"), QUEUE);
    PlanFeature::at(TIME)
        .run(&Invocation::new(root, "plan", vec!["--next".to_owned()]))
        .unwrap_or_else(|error| panic!("{}", error));
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

/// The body of one section, or none when the prompt omits it.
fn section(prompt: &str, heading: &str) -> Option<String> {
    let marker = format!("\n\n## {heading}\n\n");
    let start = prompt.find(&marker)? + marker.len();
    let rest = &prompt[start..];
    Some(match rest.find("\n\n## ") {
        Some(end) => rest[..end].to_owned(),
        None => rest.to_owned(),
    })
}

/// Adds five measured legacy tasks that never pass and never measure an end.
fn five_without_passes(root: &Path) {
    for task in 1..=5 {
        archive_task(root, "001-a", task, &events(task, false, 9, None));
    }
}

/// Adds one measured legacy task that neither passes nor measures an end.
fn one_without_pass(root: &Path) {
    archive_task(root, "001-a", 1, &events(1, false, 9, None));
}

/// Adds three changes whose one measured task dies with `timeout`.
fn three_timeouts(root: &Path) {
    for number in 1..=3 {
        let change = format!("{number:03}-a");
        let mut stream = events(1, false, 1, None);
        stream.push_str(&dead_event(1, "timeout"));
        archive_task(root, &change, 1, &stream);
    }
}

/// Adds 21 changes whose one task dies, with twelve dead events in the newest.
fn twenty_one_changes(root: &Path) {
    for number in 1..=21 {
        let change = format!("{number:03}-a");
        let mut stream = events(1, false, 1, None);
        let deads = if number == 21 { 12 } else { 1 };
        for _ in 0..deads {
            stream.push_str(&dead_event(1, "timeout"));
        }
        archive_task(root, &change, 1, &stream);
    }
}

/// The body of the one-measured-task row.
fn one_body() -> String {
    format!("First-attempt passes: 0/1\n{UNMEASURED}\nDead outcomes:\n  (none)")
}

/// The body of the two-change window row.
fn two_window_body() -> String {
    format!(
        "First-attempt passes: 0/2\n{UNMEASURED}\nDead outcomes:\n\
         - 003-a, T1, timeout\n- 002-a, T1, timeout"
    )
}

/// Proves every row of "Configured record sizes".
///
/// Covers: rust-plan/configured-record-sizes
#[test]
fn configured_record_sizes() {
    type Setup = fn(&Path);
    let rows: [(&str, &str, Setup, String); 4] = [
        (
            "minimum six",
            "[planning.record]\nminimumTasks = 6\n",
            five_without_passes,
            String::from("This repository's measured record is too small (fewer than 6 tasks)."),
        ),
        (
            "minimum one",
            "[planning.record]\nminimumTasks = 1\n",
            one_without_pass,
            one_body(),
        ),
        (
            "two recent changes",
            "[planning.record]\nminimumTasks = 1\nrecentChanges = 2\n",
            three_timeouts,
            two_window_body(),
        ),
        (
            "one dead outcome",
            "[planning.record]\ndeadOutcomes = 1\n",
            twenty_one_changes,
            format!(
                "First-attempt passes: 0/20\n{UNMEASURED}\nDead outcomes:\n\
                 - 021-a, T1, timeout"
            ),
        ),
    ];
    for (name, text, setup, expected) in rows {
        let root = scratch(&format!("record_{}", name.replace(' ', "_")));
        config(&root, text);
        setup(&root);
        let prompt = prompt(&root);
        assert_eq!(
            section(&prompt, "This repository's record"),
            Some(expected),
            "row {name}"
        );
    }
}

/// Adds three changes with one passing task each.
fn three_passing(root: &Path) {
    for number in 1..=3 {
        let change = format!("{number:03}-a");
        archive_task(root, &change, 1, &events(1, true, 3, None));
    }
}

/// The history counts line for a window of the given size.
fn counts_line(count: usize) -> String {
    format!(
        "Counts from the last {count} archived tasks that ran, from the osq query table \
         task_outcomes. They describe this project's history; nothing enforces them."
    )
}

/// Proves every row of "Configured history sizes".
///
/// Covers: rust-plan/configured-history-sizes
#[test]
fn configured_history_sizes() {
    let rows: [(&str, &str, Check); 4] = [
        ("none", "", |body| body.is_none()),
        (
            "minimum three",
            "[planning.history]\nminimumTasks = 3\n",
            |body| {
                body.as_deref()
                    .is_some_and(|text| text.lines().next() == Some(counts_line(3).as_str()))
            },
        ),
        (
            "two recent tasks",
            "[planning.history]\nminimumTasks = 3\nrecentTasks = 2\n",
            |body| {
                body.as_deref()
                    .is_some_and(|text| text.lines().next() == Some(counts_line(2).as_str()))
            },
        ),
        (
            "one line cap",
            "[planning.history]\nminimumTasks = 3\nmaxCharacters = 148\n",
            |body| body.as_deref() == Some(counts_line(3).as_str()),
        ),
    ];
    for (name, text, check) in rows {
        let root = scratch(&format!("history_{}", name.replace(' ', "_")));
        config(&root, text);
        three_passing(&root);
        let prompt = prompt(&root);
        let body = section(&prompt, "What history says");
        let shown = format!("{body:?}");
        assert!(check(body), "row {name}: {shown}");
    }
}

/// Adds four changes whose one result file holds a missing-context claim.
fn missing_contexts(root: &Path) {
    for change in ["001-a", "002-a", "003-a", "004-a"] {
        result(
            root,
            change,
            1,
            &format!("## Missing context\n\nNo {change}.\n"),
        );
    }
}

/// Adds one deviation longer than the section's whole budget.
fn long_deviation(root: &Path) {
    result(
        root,
        "001-a",
        1,
        &format!("## Deviated\n\n{}\n", "x".repeat(5000)),
    );
}

/// Proves every row of "Configured disclosure sizes".
///
/// Covers: rust-plan/configured-disclosure-sizes
#[test]
fn configured_disclosure_sizes() {
    type Setup = fn(&Path);
    let rows: [(&str, &str, Setup, String); 2] = [
        (
            "one recent change",
            "[planning.disclosures]\nrecentChanges = 1\n",
            missing_contexts,
            format!("{CLAIM}\n\n004-a task 1, missing context:\n> No 004-a."),
        ),
        (
            "twenty characters",
            "[planning.disclosures]\nmaxCharacters = 20\n",
            long_deviation,
            format!("{CLAIM}\n\n001-a tas{TRUNCATION}"),
        ),
    ];
    for (name, text, setup, expected) in rows {
        let root = scratch(&format!("disclosures_{}", name.replace(' ', "_")));
        config(&root, text);
        setup(&root);
        let prompt = prompt(&root);
        assert_eq!(
            section(&prompt, "Recent executor disclosures"),
            Some(expected),
            "row {name}"
        );
    }
}
