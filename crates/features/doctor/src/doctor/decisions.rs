//! Doctor's `decisions` check for the ADRs and the `AGENTS.md` rules block.
//!
//! The line is pure text; only this module reads the decisions folder, the
//! living specs and `AGENTS.md` (ADR 023). TypeScript's `checkDecisions` gives
//! the errors, warnings and line text.

use std::fs;
use std::path::Path;

use osq_kernel_config::Config;
use osq_kernel_specs::{
    Adr, AppliesTo, DecisionRecords, project_rules_errors, read_decisions, validate_decisions,
};

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
    errors.extend(project_rules_errors(
        &records,
        &agents,
        config.limits.max_project_rules,
    ));
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
