//! Proves the prompt's history hints section.

use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_plan::PlanFeature;
use osq_kernel_storage::TaskOutcome;

/// The one-item queue every row uses.
const QUEUE: &str = "## [a] A\n\nDepends on: nothing\n\nA.\n";

/// The fixed time whose UTC date the brief records.
const TIME: i64 = 1_792_584_000_000;

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
fn event(kind: &str, data: &str) -> String {
    format!(
        "{{\"type\":\"{kind}\",\"timestamp\":\"2026-10-01T08:00:00.000Z\",\"data\":{{{data}}}}}\n"
    )
}

/// One task's stream: a start measure, a start, its dead events and its done.
fn events(task: u64, passing: bool, files: u64, dead: &[&str]) -> String {
    let mut text = event(
        "measures",
        &format!(
            "\"phase\":\"start\",\"scopeFiles\":{files},\"scopeLines\":1,\"repoFiles\":1,\
             \"repoLines\":1,\"importFanIn\":0,\"proposalWords\":1,\"taskWords\":1,\
             \"deltaRequirements\":1,\"deltaScenarios\":1"
        ),
    );
    text.push_str(&event("started", "\"attempt\":1"));
    for reason in dead {
        text.push_str(&event(
            "dead",
            &format!("\"task\":\"{task}\",\"reason\":\"{reason}\""),
        ));
    }
    if passing {
        text.push_str(&event("done", &format!("\"task\":\"{task}\"")));
    }
    text
}

/// Writes one archived change's task file and its event stream.
fn archive_task(root: &Path, change: &str, task: u64, stream: &str) {
    let base = root.join("openspec/changes/archive").join(change);
    let file = format!(
        "---\ntitle: \"T{task}\"\nverify: node --test a.test.ts\n---\n\n## Acceptance\n- [ ] Done.\n"
    );
    write(&base.join(format!("tasks/{task}.md")), &file);
    write(&base.join(format!(".run/events/{task}.jsonl")), stream);
}

/// Adds one change with 29 tasks that all pass.
fn twenty_nine_tasks(root: &Path) {
    for task in 1..=29 {
        archive_task(root, "001-a", task, &events(task, true, 3, &[]));
    }
}

/// Adds one change with 30 tasks that all pass.
fn thirty_tasks(root: &Path) {
    for task in 1..=30 {
        archive_task(root, "001-a", task, &events(task, true, 3, &[]));
    }
}

/// Adds 101 changes with one task each, the oldest alone having nine files.
fn one_hundred_one_changes(root: &Path) {
    for number in 1..=101_u64 {
        let change = format!("{number:03}-a");
        let files = if number == 1 { 9 } else { 3 };
        archive_task(root, &change, 1, &events(1, true, files, &[]));
    }
}

/// Adds 30 tasks whose dead reasons are two each of three names and one other.
fn thirty_dead_tasks(root: &Path) {
    for task in 1..=30 {
        let dead: &[&str] = match task {
            2 | 3 => &["timeout"],
            4 | 5 => &["blocked"],
            6 | 7 => &["verify_red"],
            8 => &["crashed"],
            _ => &[],
        };
        archive_task(root, "001-a", task, &events(task, dead.is_empty(), 3, dead));
    }
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

/// The body of the prompt's `## What history says` section, or none.
fn history_body(root: &Path) -> Option<String> {
    let prompt = new_prompt(root);
    let marker = "## What history says\n\n";
    prompt.find(marker).map(|start| {
        let rest = &prompt[start + marker.len()..];
        match rest.find("\n\n## ") {
            Some(end) => rest[..end].to_owned(),
            None => rest.to_owned(),
        }
    })
}

/// Runs `plan --next` at the fixed time on a root with the one-item queue.
fn run(root: &Path) {
    write(&root.join("openspec/queue.md"), QUEUE);
    PlanFeature::at(TIME)
        .run(&Invocation::new(root, "plan", vec!["--next".to_owned()]))
        .unwrap_or_else(|error| panic!("{}", error));
}

/// Proves every row of "History hint bodies".
///
/// Covers: rust-plan/history-hint-bodies
#[test]
fn history_hint_bodies() {
    type Setup = fn(&Path);
    let thirty = String::from(
        "Counts from the last 30 archived tasks that ran, from the osq query table \
         task_outcomes. They describe this project's history; nothing enforces them.\n\
         First attempt by scope files: 3-4 30/30\n\
         First attempt by verify kind: one 30/30\n\
         First attempt by tests.modify: false 30/30\n\
         First attempt by shared scope: not shared 30/30\n\
         First attempt by position: first task 1/1, later task 29/29\n\
         Most common last dead reasons: none",
    );
    let one_hundred = String::from(
        "Counts from the last 100 archived tasks that ran, from the osq query table \
         task_outcomes. They describe this project's history; nothing enforces them.\n\
         First attempt by scope files: 3-4 100/100\n\
         First attempt by verify kind: one 100/100\n\
         First attempt by tests.modify: false 100/100\n\
         First attempt by shared scope: not shared 100/100\n\
         First attempt by position: first task 100/100\n\
         Most common last dead reasons: none",
    );
    let dead = String::from(
        "Counts from the last 30 archived tasks that ran, from the osq query table \
         task_outcomes. They describe this project's history; nothing enforces them.\n\
         First attempt by scope files: 3-4 23/30\n\
         First attempt by verify kind: one 23/30\n\
         First attempt by tests.modify: false 23/30\n\
         First attempt by shared scope: not shared 23/30\n\
         First attempt by position: first task 1/1, later task 22/29\n\
         Most common last dead reasons: blocked 2, timeout 2, verify_red 2",
    );
    let rows: [(&str, Setup, Option<String>); 4] = [
        ("29 rows", twenty_nine_tasks, None),
        ("30 rows", thirty_tasks, Some(thirty)),
        ("101 changes", one_hundred_one_changes, Some(one_hundred)),
        ("30 dead tasks", thirty_dead_tasks, Some(dead)),
    ];
    for (name, setup, expected) in rows {
        let root = scratch(&format!("prompt_history/{}", name.replace(' ', "_")));
        setup(&root);
        run(&root);
        assert_eq!(history_body(&root), expected, "row {name}");
    }
}

/// The digits a name leads with, for the included history source.
fn leading_number(name: &str) -> Option<u128> {
    name.chars()
        .take_while(char::is_ascii_digit)
        .collect::<String>()
        .parse()
        .ok()
}

/// The history source compiled here so its private helpers can be probed.
#[allow(dead_code)]
mod source {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/src/next/report/hints.rs"
    ));

    /// Fits the given lines into the given cap.
    pub(super) fn fit(lines: &[String], max: usize) -> Option<String> {
        fit_lines(lines, max)
    }

    /// Orders two fabricated rows as the history window does.
    pub(super) fn order(left: &super::TaskOutcome, right: &super::TaskOutcome) -> Ordering {
        newest_first(left, right)
    }
}

/// One fabricated outcome row with a scope size, used for ordering only.
fn row(change: &str, task: &str) -> TaskOutcome {
    TaskOutcome {
        change: change.to_owned(),
        task: task.to_owned(),
        capability: None,
        scope_globs: 0,
        scope_files: Some(3),
        verify_kind: "one",
        tests_modify: 0,
        verify_starts: "red",
        shares_scope: 0,
        position: 1,
        attempts: 1,
        first_attempt: 1,
        dead_reason: None,
        files_touched: None,
    }
}

/// Proves the history window's change and task ordering.
///
/// Covers: rust-plan/history-hint-bodies
#[test]
fn history_ordering() {
    let cases = [
        (
            "numbered before text",
            row("001-a", "1"),
            row("x-old", "1"),
            Ordering::Less,
        ),
        (
            "text after numbered",
            row("x-old", "1"),
            row("001-a", "1"),
            Ordering::Greater,
        ),
        (
            "higher number first",
            row("002-a", "1"),
            row("001-a", "1"),
            Ordering::Less,
        ),
        (
            "text names from the last",
            row("x-old", "1"),
            row("y-old", "1"),
            Ordering::Greater,
        ),
        (
            "higher task first",
            row("001-a", "2"),
            row("001-a", "1"),
            Ordering::Less,
        ),
        (
            "equal numbers by task",
            row("001-a", "2"),
            row("001-b", "1"),
            Ordering::Less,
        ),
        (
            "equal task numbers by text",
            row("001-a", "01"),
            row("001-a", "1"),
            Ordering::Less,
        ),
        (
            "text tasks ascending",
            row("001-a", "b"),
            row("001-a", "a"),
            Ordering::Greater,
        ),
        (
            "number before text task",
            row("001-a", "1"),
            row("001-a", "x"),
            Ordering::Less,
        ),
    ];
    for (name, left, right, expected) in cases {
        assert_eq!(source::order(&left, &right), expected, "row {name}");
    }
}

/// Proves the cap keeps an exact fit and drops the first line that passes it.
///
/// Covers: rust-plan/history-hint-bodies
#[test]
fn history_character_cap() {
    let lines = vec![String::from("aa"), String::from("bb"), String::from("cc")];
    let cases: [(&str, usize, Option<String>); 4] = [
        ("exact fit", 5, Some(String::from("aa\nbb"))),
        ("one over", 7, Some(String::from("aa\nbb"))),
        ("room for all", 8, Some(lines.join("\n"))),
        ("first line too long", 1, None),
    ];
    for (name, max, expected) in cases {
        assert_eq!(source::fit(&lines, max), expected, "row {name}");
    }
    let long = vec![String::from("aaaa")];
    assert_eq!(source::fit(&long, 3), None, "row single line too long");
}
