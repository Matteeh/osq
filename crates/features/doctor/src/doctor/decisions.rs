//! Doctor's `decisions` check for the ADRs and the `AGENTS.md` rules block.
//!
//! The line is pure text; only this module reads the decisions folder, the
//! living specs and `AGENTS.md` (ADR 023). TypeScript's `checkDecisions` gives
//! the errors, warnings and line text.

use std::fs;
use std::path::Path;

use osq_kernel_config::Config;
use osq_kernel_specs::{Adr, AppliesTo, DecisionRecords, read_decisions, validate_decisions};

/// TypeScript's default decisions folder, held in code as it holds it (ADR 029).
const DECISIONS_FOLDER: &str = "decisions";
/// TypeScript's default openspec folder, held in code as it holds it (ADR 029).
const OPENSPEC_FOLDER: &str = "openspec";
/// The living capability specs folder below the openspec folder.
const SPECS_FOLDER: &str = "specs";
/// The file that holds a capability's living spec.
const SPEC_FILE: &str = "spec.md";
/// The file that holds the managed blocks and the project rules block.
const AGENTS_FILE: &str = "AGENTS.md";
/// The marker the project rules block opens with.
const RULES_START_MARKER: &str = "<!-- OSQ:RULES:START -->";
/// The marker the project rules block closes with.
const RULES_END_MARKER: &str = "<!-- OSQ:RULES:END -->";
/// The heading the project rules block holds after its start marker.
const RULES_HEADING: &str = "## Project rules\n\n";
/// The error TypeScript reports for a missing project rules block.
const MISSING_RULES: &str = "AGENTS.md is missing its project rules block; run `osq init`";
/// The error TypeScript reports when no system-wide ADR expects a block.
const UNEXPECTED_RULES: &str = "AGENTS.md has an unexpected project rules block; run `osq init`";
/// The error TypeScript reports for a block that differs from the expected one.
const STALE_RULES: &str = "AGENTS.md project rules block is out of date; run `osq init`";
/// The warning TypeScript appends when no accepted ADR applies to all.
const NO_SYSTEM_WIDE_ADR: &str =
    "no accepted ADR applies to all; write the architecture and style ADRs first";

/// Builds the `decisions` line, or none when the project has no decisions.
///
/// Implements: rust-doctor/doctor-decisions
pub(super) fn decisions_line(root: &Path, config: &Config) -> Option<String> {
    let records = read_decisions(
        root,
        Path::new(DECISIONS_FOLDER),
        Path::new(OPENSPEC_FOLDER),
    );
    let agents = agents_text(root);
    if records.adrs.is_empty() && records.ignored.is_empty() && !agents.contains(RULES_START_MARKER)
    {
        return None;
    }
    let living = living_capabilities(root);
    let max_rule_length = usize::try_from(config.limits.max_rule_length).unwrap_or(usize::MAX);
    let problems = validate_decisions(&records, &living, max_rule_length);
    let mut errors: Vec<String> = problems.errors.iter().map(ToString::to_string).collect();
    errors.extend(missing_check_files(root, &records));
    errors.extend(project_rules_errors(&records, &agents, config));
    if !errors.is_empty() {
        return Some(format!("[fail] decisions: {}", errors.join("; ")));
    }
    let mut warnings: Vec<String> = problems.warnings.iter().map(ToString::to_string).collect();
    if system_wide_adrs(&records).is_empty() {
        warnings.push(NO_SYSTEM_WIDE_ADR.to_owned());
    }
    if !warnings.is_empty() {
        return Some(format!("[warn] decisions: {}", warnings.join("; ")));
    }
    Some(format!("[ok] decisions: {} ADRs valid", records.adrs.len()))
}

/// Reads `AGENTS.md` as text, with invalid UTF-8 replaced, or the empty text
/// when it cannot be read.
///
/// Implements: rust-doctor/doctor-decisions
fn agents_text(root: &Path) -> String {
    match fs::read(root.join(AGENTS_FILE)) {
        Ok(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
        Err(_) => String::new(),
    }
}

/// The names of the folders directly under `openspec/specs` that hold a
/// `spec.md`, in byte order.
///
/// Implements: rust-doctor/doctor-decisions
fn living_capabilities(root: &Path) -> Vec<String> {
    let specs = root.join(OPENSPEC_FOLDER).join(SPECS_FOLDER);
    let Ok(entries) = fs::read_dir(specs) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.path().join(SPEC_FILE).is_file())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

/// The errors for every `checks` entry of an accepted ADR that names no file.
///
/// Implements: rust-doctor/doctor-decisions
fn missing_check_files(root: &Path, records: &DecisionRecords) -> Vec<String> {
    let mut errors = Vec::new();
    for adr in records.adrs.iter().filter(|adr| adr.status == "accepted") {
        for file in &adr.checks {
            if !root.join(file).exists() {
                errors.push(format!("{}: check file {file} does not exist", adr.path));
            }
        }
    }
    errors
}

/// The project rules errors: the block comparison and the system-wide count.
///
/// Implements: rust-doctor/doctor-decisions
fn project_rules_errors(records: &DecisionRecords, agents: &str, config: &Config) -> Vec<String> {
    let system_wide = system_wide_adrs(records);
    let expected = expected_rules_block(&system_wide);
    let current = current_rules_block(agents);
    let mut errors = Vec::new();
    if current != expected {
        let message = match (current, expected) {
            (None, _) => MISSING_RULES,
            (Some(_), None) => UNEXPECTED_RULES,
            (Some(_), Some(_)) => STALE_RULES,
        };
        errors.push(message.to_owned());
    }
    let count = u64::try_from(system_wide.len()).unwrap_or(u64::MAX);
    if count > config.limits.max_project_rules {
        errors.push(format!(
            "AGENTS.md holds {count} project rules, more than limits.maxProjectRules ({})",
            config.limits.max_project_rules
        ));
    }
    errors
}

/// The accepted ADRs whose `governs` is `all`, in ADR order.
///
/// Implements: rust-doctor/doctor-decisions
fn system_wide_adrs(records: &DecisionRecords) -> Vec<&Adr> {
    records
        .adrs
        .iter()
        .filter(|adr| adr.status == "accepted" && adr.governs == AppliesTo::All)
        .collect()
}

/// The project rules block the system-wide ADRs expect, or none without one.
///
/// Implements: rust-doctor/doctor-decisions
fn expected_rules_block(system_wide: &[&Adr]) -> Option<String> {
    if system_wide.is_empty() {
        return None;
    }
    let lines: Vec<String> = system_wide
        .iter()
        .map(|adr| format!("- {} ADR {}", adr.rule, adr.number))
        .collect();
    Some(format!(
        "{RULES_START_MARKER}\n{RULES_HEADING}{}\n{RULES_END_MARKER}",
        lines.join("\n")
    ))
}

/// The first ordered pair of rules markers in `agents`, or none.
///
/// Implements: rust-doctor/doctor-decisions
fn current_rules_block(agents: &str) -> Option<String> {
    let start = agents.find(RULES_START_MARKER)?;
    let end = agents.find(RULES_END_MARKER)?;
    end.checked_sub(start)?;
    Some(agents[start..end + RULES_END_MARKER.len()].to_owned())
}
