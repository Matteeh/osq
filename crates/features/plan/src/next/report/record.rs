//! The prompt's `## This repository's record` section.

use std::cmp::Ordering;

use osq_kernel_storage::{ChangeSnapshot, Location};

use super::{compare_numeric_prefix, leading_number};

/// One measured task of the record's window.
struct Measured {
    /// The change folder.
    change: String,
    /// The task id.
    task: String,
    /// The task file's title.
    title: String,
    /// The resolved scope size.
    scope_files: u64,
    /// The declared acceptance line count.
    acceptance_lines: usize,
    /// Whether the first attempt passed.
    first_attempt_pass: bool,
    /// The first start measure's scope resolver.
    resolver: Option<u64>,
    /// The summed start-to-end milliseconds.
    duration_ms: Option<u64>,
}

/// Builds the record section's body from the archived and rejected snapshots.
///
/// Implements: rust-plan/repository-record-section
pub(super) fn body(
    snapshots: &[ChangeSnapshot],
    minimum_tasks: usize,
    recent_changes: usize,
    dead_outcomes: usize,
) -> String {
    let window = window(snapshots, recent_changes);
    let measured = measured_tasks(&window);
    if measured.len() < minimum_tasks {
        return format!(
            "This repository's measured record is too small (fewer than {minimum_tasks} tasks)."
        );
    }
    let passed = measured
        .iter()
        .filter(|task| task.first_attempt_pass)
        .count();
    let mut lines = vec![format!("First-attempt passes: {passed}/{}", measured.len())];
    lines.push(largest_line(&measured));
    lines.push(median_line(&measured));
    lines.push(String::from("Dead outcomes:"));
    let dead = dead_lines(&window, dead_outcomes);
    if dead.is_empty() {
        lines.push(String::from("  (none)"));
    } else {
        lines.extend(dead);
    }
    lines.join("\n")
}

/// The archived snapshots by newest number first, capped at the window size.
fn window(snapshots: &[ChangeSnapshot], recent_changes: usize) -> Vec<&ChangeSnapshot> {
    let mut window: Vec<&ChangeSnapshot> = snapshots
        .iter()
        .filter(|snapshot| snapshot.location == Location::Archived)
        .collect();
    window.sort_by(|left, right| {
        match (leading_number(&left.folder), leading_number(&right.folder)) {
            (Some(a), Some(b)) => b.cmp(&a).then_with(|| left.folder.cmp(&right.folder)),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            (None, None) => left.folder.cmp(&right.folder),
        }
    });
    window.truncate(recent_changes);
    window
}

/// Every measured task of the window, in window order and then task order.
fn measured_tasks(window: &[&ChangeSnapshot]) -> Vec<Measured> {
    let mut measured = Vec::new();
    for snapshot in window {
        for task in &snapshot.tasks {
            let outcome = &task.outcome;
            let Some(start) = outcome.start_scope_files else {
                continue;
            };
            let scope_files = outcome.scope_hash_paths.as_ref().map_or(start, |paths| {
                u64::try_from(paths.len()).unwrap_or(u64::MAX)
            });
            measured.push(Measured {
                change: snapshot.folder.clone(),
                task: task.id.as_str().to_owned(),
                title: task.title.clone(),
                scope_files,
                acceptance_lines: task.plan.acceptance.len(),
                first_attempt_pass: outcome.first_attempt_passed,
                resolver: outcome.start_scope_resolver,
                duration_ms: outcome.measured_ms,
            });
        }
    }
    measured
}

/// The largest first-attempt pass line, or its unavailable form.
fn largest_line(measured: &[Measured]) -> String {
    let resolver2: Vec<&Measured> = measured
        .iter()
        .filter(|task| task.resolver == Some(2))
        .collect();
    let (scope, label) = if resolver2.is_empty() {
        (
            measured
                .iter()
                .filter(|task| task.resolver.is_none())
                .collect(),
            " [legacy scope]",
        )
    } else {
        (resolver2, " [resolver 2 scope]")
    };
    let Some(task) = select_largest(&scope) else {
        return String::from("Largest first-attempt pass: unavailable");
    };
    format!(
        "Largest first-attempt pass: {}/{} \"{}\" (scope files: {}, acceptance lines: {}){label}",
        task.change, task.task, task.title, task.scope_files, task.acceptance_lines
    )
}

/// The passing task with the most scope files, then acceptance lines, then id.
fn select_largest<'a>(tasks: &[&'a Measured]) -> Option<&'a Measured> {
    let mut passing: Vec<&Measured> = tasks
        .iter()
        .copied()
        .filter(|task| task.first_attempt_pass)
        .collect();
    passing.sort_by(|left, right| {
        right
            .scope_files
            .cmp(&left.scope_files)
            .then_with(|| right.acceptance_lines.cmp(&left.acceptance_lines))
            .then_with(|| compare_numeric_prefix(&left.change, &right.change))
            .then_with(|| compare_numeric_prefix(&left.task, &right.task))
    });
    passing.first().copied()
}

/// The median duration line, or its unavailable form without any duration.
fn median_line(measured: &[Measured]) -> String {
    let mut durations: Vec<u64> = measured
        .iter()
        .filter_map(|task| task.duration_ms)
        .collect();
    let duration =
        median_millis(&mut durations).map_or_else(|| String::from("unavailable"), format_duration);
    format!("Median task duration: {duration}")
}

/// The median rounded to two decimals of a second, or none without a value.
///
/// The value stays in milliseconds: two decimals of a second are ten
/// milliseconds, and rounding a half up keeps TypeScript's `Math.round`.
fn median_millis(durations: &mut [u64]) -> Option<u128> {
    if durations.is_empty() {
        return None;
    }
    durations.sort_unstable();
    let middle = durations.len() / 2;
    let doubled = if durations.len() % 2 == 0 {
        u128::from(durations[middle - 1]) + u128::from(durations[middle])
    } else {
        2 * u128::from(durations[middle])
    };
    Some((doubled + 10) / 20 * 10)
}

/// A duration shown as TypeScript's `formatDuration` shows it.
fn format_duration(millis: u128) -> String {
    if millis == 0 {
        return String::from("0s");
    }
    let total = (millis + 500) / 1000;
    if total < 60 {
        return format!("{total}s");
    }
    let minutes = total / 60;
    let seconds = total % 60;
    if seconds > 0 {
        format!("{minutes}m {seconds}s")
    } else {
        format!("{minutes}m")
    }
}

/// The first `dead_outcomes` dead event lines of the window, in order.
fn dead_lines(window: &[&ChangeSnapshot], dead_outcomes: usize) -> Vec<String> {
    let mut lines = Vec::new();
    for snapshot in window {
        let Some(facts) = snapshot.facts.as_ref() else {
            continue;
        };
        for task in &snapshot.tasks {
            for dead in &facts.dead_attempts {
                if dead.task != task.id.as_str() {
                    continue;
                }
                lines.push(format!(
                    "- {}, {}, {}",
                    snapshot.folder,
                    task.title,
                    dead.reason.as_str()
                ));
                if lines.len() == dead_outcomes {
                    return lines;
                }
            }
        }
    }
    lines
}
