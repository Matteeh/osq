// The prompt's `## What history says` section.

use std::cmp::Ordering;
use std::collections::BTreeMap;

use osq_kernel_storage::TaskOutcome;

use super::leading_number;

/// The fewest rows that ran before the history shows.
const MINIMUM_TASKS: usize = 30;

/// The newest rows the counts cover.
const RECENT_TASKS: usize = 100;

/// The most UTF-16 code units the body may hold.
const MAX_CHARACTERS: usize = 1500;

/// One counted group of the history lines.
struct Group {
    /// The group's label.
    label: &'static str,
    /// The rows of the group whose first attempt passed.
    passed: usize,
    /// The rows of the group.
    rows: usize,
}

/// Builds the history section's body, or none when too little history ran.
///
/// Implements: rust-plan/history-hints-section
pub(super) fn body(rows: &[TaskOutcome]) -> Option<String> {
    let ran: Vec<&TaskOutcome> = rows.iter().filter(|row| row.attempts >= 1).collect();
    if ran.len() < MINIMUM_TASKS {
        return None;
    }
    let mut window = ran;
    window.sort_by(|left, right| newest_first(left, right));
    window.truncate(RECENT_TASKS);

    let mut lines = vec![counts_line(window.len())];
    if let Some(line) = groups_line("First attempt by scope files", &scope_groups(&window)) {
        lines.push(line);
    }
    for (prefix, groups) in [
        ("First attempt by verify kind", verify_groups(&window)),
        ("First attempt by tests.modify", tests_groups(&window)),
        ("First attempt by shared scope", shared_groups(&window)),
        ("First attempt by position", position_groups(&window)),
    ] {
        if let Some(line) = groups_line(prefix, &groups) {
            lines.push(line);
        }
    }
    lines.push(dead_reason_line(&window));
    fit_lines(&lines, MAX_CHARACTERS)
}

/// Newest change number first, then newest task number, then task text.
fn newest_first(left: &TaskOutcome, right: &TaskOutcome) -> Ordering {
    change_order(left, right).then_with(|| task_order(left, right))
}

/// Numbered changes before text ones, the higher number or name first.
fn change_order(left: &TaskOutcome, right: &TaskOutcome) -> Ordering {
    match (leading_number(&left.change), leading_number(&right.change)) {
        (Some(a), Some(b)) => b.cmp(&a),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => right.change.cmp(&left.change),
    }
}

/// The higher task number first, or the task text ascending when not numbers.
fn task_order(left: &TaskOutcome, right: &TaskOutcome) -> Ordering {
    match (leading_number(&left.task), leading_number(&right.task)) {
        (Some(a), Some(b)) => b.cmp(&a).then_with(|| left.task.cmp(&right.task)),
        _ => left.task.cmp(&right.task),
    }
}

/// The sentence naming how many rows the counts cover.
fn counts_line(count: usize) -> String {
    format!(
        "Counts from the last {count} archived tasks that ran, from the osq query table task_outcomes. They describe this project's history; nothing enforces them."
    )
}

/// One labelled group over the rows that match it.
fn group(
    label: &'static str,
    rows: &[&TaskOutcome],
    matches: impl Fn(&TaskOutcome) -> bool,
) -> Group {
    let mut passed = 0;
    let mut tasks = 0;
    for row in rows {
        if !matches(row) {
            continue;
        }
        tasks += 1;
        if row.first_attempt == 1 {
            passed += 1;
        }
    }
    Group {
        label,
        passed,
        rows: tasks,
    }
}

/// One counted line, or none when no group holds a row.
fn groups_line(prefix: &str, groups: &[Group]) -> Option<String> {
    let present: Vec<&Group> = groups.iter().filter(|group| group.rows > 0).collect();
    if present.is_empty() {
        return None;
    }
    let counts: Vec<String> = present
        .iter()
        .map(|group| format!("{} {}/{}", group.label, group.passed, group.rows))
        .collect();
    Some(format!("{prefix}: {}", counts.join(", ")))
}

/// Whether a scope size sits in an inclusive range; rows without one sit in none.
fn in_range(files: Option<i64>, low: i64, high: i64) -> bool {
    files.is_some_and(|value| value >= low && value <= high)
}

/// The four scope-file buckets, rows without a size in none.
fn scope_groups(rows: &[&TaskOutcome]) -> Vec<Group> {
    vec![
        group("1-2", rows, |row| in_range(row.scope_files, 1, 2)),
        group("3-4", rows, |row| in_range(row.scope_files, 3, 4)),
        group("5-8", rows, |row| in_range(row.scope_files, 5, 8)),
        group("over 8", rows, |row| in_range(row.scope_files, 9, i64::MAX)),
    ]
}

/// The four verify kinds, in their fixed order.
fn verify_groups(rows: &[&TaskOutcome]) -> Vec<Group> {
    ["one", "several", "suite", "other"]
        .into_iter()
        .map(|kind| group(kind, rows, |row| row.verify_kind == kind))
        .collect()
}

/// The tests.modify true and false groups.
fn tests_groups(rows: &[&TaskOutcome]) -> Vec<Group> {
    vec![
        group("true", rows, |row| row.tests_modify == 1),
        group("false", rows, |row| row.tests_modify != 1),
    ]
}

/// The shared and not shared scope groups.
fn shared_groups(rows: &[&TaskOutcome]) -> Vec<Group> {
    vec![
        group("shared", rows, |row| row.shares_scope == 1),
        group("not shared", rows, |row| row.shares_scope != 1),
    ]
}

/// The first task and later task groups.
fn position_groups(rows: &[&TaskOutcome]) -> Vec<Group> {
    vec![
        group("first task", rows, |row| row.position == 1),
        group("later task", rows, |row| row.position != 1),
    ]
}

/// The three most common non-empty dead reasons, most rows first, then name.
fn dead_reason_line(rows: &[&TaskOutcome]) -> String {
    let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
    for row in rows {
        if let Some(reason) = &row.dead_reason {
            if reason.is_empty() {
                continue;
            }
            *counts.entry(reason.as_str()).or_insert(0) += 1;
        }
    }
    if counts.is_empty() {
        return String::from("Most common last dead reasons: none");
    }
    let mut ordered: Vec<(&str, usize)> = counts.into_iter().collect();
    ordered.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(right.0)));
    ordered.truncate(3);
    let entries: Vec<String> = ordered
        .iter()
        .map(|(reason, count)| format!("{reason} {count}"))
        .collect();
    format!("Most common last dead reasons: {}", entries.join(", "))
}

/// Keeps lines in order while the joined body stays within the cap.
fn fit_lines(lines: &[String], max_characters: usize) -> Option<String> {
    let mut kept: Vec<&str> = Vec::new();
    let mut used = 0_usize;
    for line in lines {
        let length = line.encode_utf16().count();
        let addition = if kept.is_empty() { length } else { length + 1 };
        if used + addition > max_characters {
            break;
        }
        kept.push(line);
        used += addition;
    }
    if kept.is_empty() {
        None
    } else {
        Some(kept.join("\n"))
    }
}
