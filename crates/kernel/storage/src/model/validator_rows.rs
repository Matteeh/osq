//! Mapping kept change-stream events and plan records to the `validator_runs`,
//! `validator_findings` and `link_findings` rows.
//!
//! Pure leaves: they take a snapshot and give back row structs, with no disk or
//! SQLite access (ADR 023).

use serde_json::Value;

use osq_core::Event;

use crate::read::ChangeSnapshot;

use super::rows::{count_i64, len_i64, number_f64, string_of, table_events};

/// One row of the `validator_runs` table.
pub(super) struct ValidatorRunRow {
    /// The change folder.
    pub(super) change: String,
    /// The run's 1-based position in the change stream.
    pub(super) run: i64,
    /// The validator outcome.
    pub(super) outcome: String,
    /// The validator harness.
    pub(super) harness: String,
    /// The validator model.
    pub(super) model: String,
    /// The wall seconds the run took.
    pub(super) duration: f64,
    /// The run's exit code, or null.
    pub(super) exit_code: Option<i64>,
    /// How many scenarios were judged.
    pub(super) scenarios: i64,
    /// How many valid findings the run has.
    pub(super) findings: i64,
    /// Why the validator did not run, or null.
    pub(super) reason: Option<String>,
    /// The run's output, or null.
    pub(super) output: Option<String>,
}

/// One row of the `validator_findings` table.
pub(super) struct ValidatorFindingRow {
    /// The positional id, `<id>.v<run>.<k>`.
    pub(super) id: String,
    /// The change folder.
    pub(super) change: String,
    /// The run's position in the change stream.
    pub(super) run: i64,
    /// The finding's 1-based position among the run's valid findings.
    pub(super) finding: i64,
    /// The finding's capability.
    pub(super) capability: String,
    /// The finding's requirement.
    pub(super) requirement: String,
    /// The finding's scenario.
    pub(super) scenario: String,
    /// The finding's problem.
    pub(super) problem: String,
    /// The finding's detail.
    pub(super) detail: String,
}

/// One row of the `link_findings` table.
pub(super) struct LinkFindingRow {
    /// The positional id, `<id>.l<k>`.
    pub(super) id: String,
    /// The change folder.
    pub(super) change: String,
    /// The finding's severity.
    pub(super) severity: String,
    /// The file the finding names.
    pub(super) file: String,
    /// The finding's message.
    pub(super) message: String,
}

/// The `validator_runs` and `validator_findings` rows of one snapshot.
#[derive(Default)]
pub(super) struct ValidatorTables {
    /// The run rows.
    pub(super) runs: Vec<ValidatorRunRow>,
    /// The finding rows.
    pub(super) findings: Vec<ValidatorFindingRow>,
}

/// One validator finding with all five string fields present.
struct Finding {
    /// The finding's capability.
    capability: String,
    /// The finding's requirement.
    requirement: String,
    /// The finding's scenario.
    scenario: String,
    /// The finding's problem.
    problem: String,
    /// The finding's detail.
    detail: String,
}

/// Maps every kept `validator_ran` event to its run and finding rows.
pub(super) fn validator_tables(snapshot: &ChangeSnapshot) -> ValidatorTables {
    let mut tables = ValidatorTables::default();
    let mut run = 0i64;
    for event in table_events(snapshot) {
        let Event::ValidatorRan(data) = &event.event else {
            continue;
        };
        run += 1;
        let findings = valid_findings(&data.findings);
        tables.runs.push(ValidatorRunRow {
            change: snapshot.folder.clone(),
            run,
            outcome: data.outcome.as_str().to_owned(),
            harness: data.harness.clone(),
            model: data.model.clone(),
            duration: number_f64(&data.duration),
            exit_code: data.exit_code.0,
            scenarios: count_i64(data.scenarios),
            findings: len_i64(findings.len()),
            reason: data.reason.map(|reason| reason.as_str().to_owned()),
            output: data.output.clone(),
        });
        for (index, finding) in findings.iter().enumerate() {
            let position = len_i64(index + 1);
            tables.findings.push(ValidatorFindingRow {
                id: format!("{}.v{}.{}", snapshot.id, run, position),
                change: snapshot.folder.clone(),
                run,
                finding: position,
                capability: finding.capability.clone(),
                requirement: finding.requirement.clone(),
                scenario: finding.scenario.clone(),
                problem: finding.problem.clone(),
                detail: finding.detail.clone(),
            });
        }
    }
    tables
}

/// Maps the last plan record's link findings of one archived snapshot.
pub(super) fn link_rows(snapshot: &ChangeSnapshot) -> Vec<LinkFindingRow> {
    let Some(entries) = snapshot
        .plan_records
        .last()
        .and_then(|record| record.traceability.as_ref())
    else {
        return Vec::new();
    };
    entries
        .iter()
        .enumerate()
        .map(|(index, entry)| LinkFindingRow {
            id: format!("{}.l{}", snapshot.id, len_i64(index + 1)),
            change: snapshot.folder.clone(),
            severity: entry.severity.clone(),
            file: entry.file.clone(),
            message: entry.message.clone(),
        })
        .collect()
}

/// The findings that are objects with all five string fields, in order.
fn valid_findings(value: &Value) -> Vec<Finding> {
    value.as_array().map_or_else(Vec::new, |entries| {
        entries.iter().filter_map(finding).collect()
    })
}

/// One finding, or `None` when a field is missing or not a string.
fn finding(value: &Value) -> Option<Finding> {
    let object = value.as_object()?;
    Some(Finding {
        capability: string_of(object.get("capability"))?,
        requirement: string_of(object.get("requirement"))?,
        scenario: string_of(object.get("scenario"))?,
        problem: string_of(object.get("problem"))?,
        detail: string_of(object.get("detail"))?,
    })
}
