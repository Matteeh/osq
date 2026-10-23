//! The cross-task warnings: harness fixtures, shared scope files, unresolved
//! verifies and `verify_starts` contradictions.

use std::collections::HashSet;
use std::path::Path;

use osq_kernel_specs::VerifyStarts;

use super::super::finding::{Finding, Severity};
use super::super::verify;
use super::{TaskData, named, task_order};

/// Every cross-task warning for one change, in TypeScript's order.
pub(super) fn findings(root: &Path, tasks: &[TaskData], overlap: bool) -> Vec<Finding> {
    let mut ordered: Vec<&TaskData> = tasks.iter().collect();
    ordered.sort_by(|left, right| task_order(&left.name, &right.name));
    let mut findings = Vec::new();
    add_harness(&mut findings, &ordered);
    if overlap {
        add_overlap(&mut findings, &ordered);
    }
    add_unresolved(root, &mut findings, &ordered);
    add_verify_starts(root, &mut findings, &ordered);
    findings
}

/// Adds one warning per task resolving harness scope without event fixtures.
fn add_harness(findings: &mut Vec<Finding>, tasks: &[&TaskData]) {
    for task in tasks {
        let has_harness = task
            .existing
            .iter()
            .any(|path| path.starts_with("src/harness/"));
        let has_fixtures = task.existing.iter().any(|path| {
            path == "tests/fixtures/events" || path.starts_with("tests/fixtures/events/")
        });
        if has_harness && !has_fixtures {
            findings.push(warning(
                &task.path,
                format!(
                    "Task in {} resolves src/harness/ scope but no file under \
                     tests/fixtures/events/",
                    task.name
                ),
            ));
        }
    }
}

/// Adds one warning per pair of tasks sharing a resolved scope file.
fn add_overlap(findings: &mut Vec<Finding>, tasks: &[&TaskData]) {
    for (index, left) in tasks.iter().enumerate() {
        for right in &tasks[index + 1..] {
            let other: HashSet<&str> = right.existing.iter().map(String::as_str).collect();
            let mut shared: Vec<&String> = left
                .existing
                .iter()
                .filter(|path| other.contains(path.as_str()))
                .collect();
            shared.sort();
            for path in shared {
                findings.push(warning(
                    path,
                    format!(
                        "Tasks {} and {} share resolved scope file {path}",
                        left.number, right.number
                    ),
                ));
            }
        }
    }
}

/// Adds one warning per unresolved verify whose missing paths no scope covers.
fn add_unresolved(root: &Path, findings: &mut Vec<Finding>, tasks: &[&TaskData]) {
    let mut earlier: Vec<Vec<String>> = Vec::new();
    for task in tasks {
        if !task.verify.is_empty() && task.analysis.unresolved && !verify::chains(&task.verify) {
            let named_paths = named::list(&task.verify);
            let missing = named::missing(root, &task.verify);
            let mut scopes = Vec::with_capacity(earlier.len() + 1);
            scopes.push(task.scope.clone());
            scopes.extend(earlier.iter().cloned());
            let covered = !named_paths.is_empty()
                && missing.iter().all(|path| named::covered_by(path, &scopes));
            if !covered {
                findings.push(warning(
                    &task.path,
                    verify::unresolved_warning(&format!("Task in {}", task.name), &task.verify),
                ));
            }
        }
        earlier.push(task.scope.clone());
    }
}

/// Adds the `verify_starts` contradictions and paths no task can create.
fn add_verify_starts(root: &Path, findings: &mut Vec<Finding>, tasks: &[&TaskData]) {
    let mut earlier: Vec<Vec<String>> = Vec::new();
    for task in tasks {
        for path in named::missing(root, &task.verify) {
            if named::covered_by(&path, &earlier) {
                continue;
            }
            let own = named::covered(&path, &task.scope);
            if own {
                if task.verify_starts != VerifyStarts::Red {
                    findings.push(warning(
                        &task.path,
                        format!(
                            "Task in {} declares verify_starts: {} but its verify names {path}, \
                             which the task creates",
                            task.name,
                            start_name(task.verify_starts)
                        ),
                    ));
                }
            } else {
                findings.push(warning(
                    &task.path,
                    format!(
                        "Task in {} verify names {path}, which no task in the change can create",
                        task.name
                    ),
                ));
            }
        }
        earlier.push(task.scope.clone());
    }
}

/// The word a `verify_starts` value writes.
fn start_name(start: VerifyStarts) -> &'static str {
    match start {
        VerifyStarts::Red => "red",
        VerifyStarts::Green => "green",
        VerifyStarts::Any => "any",
    }
}

/// One task warning with no section.
fn warning(file: &str, message: String) -> Finding {
    Finding::new(Severity::Warning, file, None, message)
}
