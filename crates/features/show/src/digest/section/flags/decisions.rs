//! The ADR departure and ADR check-modification flags.

use std::collections::BTreeSet;
use std::path::Path;

use osq_kernel_specs::{Adr, read_decisions};

use super::tasks::compare_numbers;
use super::{Flag, TaskView};

/// One flag per departure line, then one per task allowed to edit an ADR check.
pub(super) fn flags(
    root: &Path,
    decisions_section: &str,
    tasks: &[TaskView],
    openspec: &str,
) -> Vec<Flag> {
    let records = read_decisions(root, Path::new("decisions"), Path::new(openspec));
    let mut flags = departures(decisions_section);
    flags.extend(checks(&records.adrs, tasks));
    flags
}

/// One `adr_departure` flag per departure line, in section order.
fn departures(section: &str) -> Vec<Flag> {
    let mut flags = Vec::new();
    for line in section.split('\n') {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let text = without_list_marker(trimmed);
        let Some(number) = departure_number(text) else {
            continue;
        };
        flags.push(Flag::new(
            "adr_departure",
            format!("departs from ADR {number}"),
            text,
        ));
    }
    flags
}

/// A line without one leading Markdown list marker.
fn without_list_marker(line: &str) -> &str {
    let Some(rest) = line.strip_prefix('-') else {
        return line;
    };
    if rest.starts_with(char::is_whitespace) {
        rest.trim_start_matches(char::is_whitespace)
    } else {
        line
    }
}

/// The ADR number of a `Departs from ADR <n>:` line.
fn departure_number(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("Departs from ADR")?;
    if !rest.starts_with(char::is_whitespace) {
        return None;
    }
    let rest = rest.trim_start_matches(char::is_whitespace);
    let digits = rest.chars().take_while(char::is_ascii_digit).count();
    if digits == 0 {
        return None;
    }
    let (number, after) = rest.split_at(digits);
    after.starts_with(':').then_some(number)
}

/// One `adr_check_modified` flag per task and accepted ADR check it may edit.
fn checks(adrs: &[Adr], tasks: &[TaskView]) -> Vec<Flag> {
    let accepted: Vec<&Adr> = adrs.iter().filter(|adr| adr.status == "accepted").collect();
    let mut ordered: Vec<&TaskView> = tasks.iter().collect();
    ordered.sort_by(|left, right| compare_numbers(&left.number, &right.number));
    let mut flags = Vec::new();
    for task in ordered {
        if !task.tests_modify {
            continue;
        }
        let paths: BTreeSet<&str> = task.paths.iter().map(String::as_str).collect();
        for adr in &accepted {
            for file in &adr.checks {
                if !paths.contains(file.as_str()) {
                    continue;
                }
                flags.push(Flag::new(
                    "adr_check_modified",
                    format!(
                        "task {} may modify a check of ADR {}",
                        task.number, adr.number
                    ),
                    format!(
                        "{file} enforces ADR {}: {} Record it as Departs from ADR {}: in ## Decisions.",
                        adr.number, adr.rule, adr.number
                    ),
                ));
            }
        }
    }
    flags
}
