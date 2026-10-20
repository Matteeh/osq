//! Mapping kept task-stream events to the `focused_runs`, `mutation_picks` and
//! `mutation_survivors` rows.
//!
//! Pure leaves: they take a snapshot and give back row structs, with no disk or
//! SQLite access (ADR 023).

use osq_core::{Event, Stream, TaskId};

use crate::read::ChangeSnapshot;

use super::rows::{count_i64, flag, len_i64, number_f64, string_of, table_events};

/// One row of the `focused_runs` table.
pub(super) struct FocusedRunRow {
    /// The change folder.
    pub(super) change: String,
    /// The task whose stream held the event.
    pub(super) task: String,
    /// The run's 1-based position in its stream.
    pub(super) run: i64,
    /// The run's outcome.
    pub(super) outcome: String,
    /// The command's exit code.
    pub(super) exit_code: i64,
    /// The wall seconds the run took.
    pub(super) duration: f64,
    /// 1 when the run timed out, else 0.
    pub(super) timed_out: i64,
    /// The scenarios run, joined by a newline.
    pub(super) scenarios: String,
    /// The files run, joined by a newline.
    pub(super) files: String,
}

/// One row of the `mutation_picks` table.
pub(super) struct MutationPickRow {
    /// The change folder.
    pub(super) change: String,
    /// The task whose stream held the event.
    pub(super) task: String,
    /// The pick's 1-based position in its stream.
    pub(super) pick: i64,
    /// The file under test.
    pub(super) file: String,
    /// The function under test.
    pub(super) function: String,
    /// The run's outcome.
    pub(super) outcome: String,
    /// Why the pick was not measured, or null.
    pub(super) reason: Option<String>,
    /// Mutants killed.
    pub(super) killed: i64,
    /// Mutants survived.
    pub(super) survived: i64,
    /// Mutants invalid.
    pub(super) invalid: i64,
    /// The wall seconds the run took.
    pub(super) duration: f64,
    /// The scenarios covered, joined by a newline.
    pub(super) scenarios: String,
}

/// One row of the `mutation_survivors` table.
pub(super) struct MutationSurvivorRow {
    /// The positional id, `<id>.<n>.m<pick>.<k>`.
    pub(super) id: String,
    /// The change folder.
    pub(super) change: String,
    /// The task whose stream held the event.
    pub(super) task: String,
    /// The pick's position in its stream.
    pub(super) pick: i64,
    /// The survivor's file, or null.
    pub(super) file: Option<String>,
    /// The pick's function.
    pub(super) function: String,
    /// The survivor's line, or null.
    pub(super) line: Option<f64>,
    /// The survivor's column, or null.
    pub(super) column: Option<f64>,
    /// The mutator, or null.
    pub(super) mutator: Option<String>,
    /// The replacement, or null.
    pub(super) replacement: Option<String>,
}

/// The `mutation_picks` and `mutation_survivors` rows of one snapshot.
#[derive(Default)]
pub(super) struct MutationTables {
    /// The pick rows.
    pub(super) picks: Vec<MutationPickRow>,
    /// The survivor rows.
    pub(super) survivors: Vec<MutationSurvivorRow>,
}

/// Maps every kept `focused_ran` event to a `focused_runs` row, in fold order.
pub(super) fn focused_rows(snapshot: &ChangeSnapshot) -> Vec<FocusedRunRow> {
    let mut rows = Vec::new();
    let mut current: Option<&Stream> = None;
    let mut run = 0i64;
    for event in table_events(snapshot) {
        if current != Some(&event.stream) {
            current = Some(&event.stream);
            run = 0;
        }
        let Stream::Task(task) = &event.stream else {
            continue;
        };
        let Event::FocusedRan(data) = &event.event else {
            continue;
        };
        run += 1;
        rows.push(FocusedRunRow {
            change: snapshot.folder.clone(),
            task: task.as_str().to_owned(),
            run,
            outcome: data.outcome.as_str().to_owned(),
            exit_code: data.exit_code,
            duration: number_f64(&data.duration),
            timed_out: flag(data.timed_out),
            scenarios: data.scenarios.join("\n"),
            files: data.files.join("\n"),
        });
    }
    rows
}

/// Maps every kept `mutation_ran` event to its pick and survivor rows.
pub(super) fn mutation_tables(snapshot: &ChangeSnapshot) -> MutationTables {
    let mut tables = MutationTables::default();
    let mut current: Option<&Stream> = None;
    let mut pick = 0i64;
    for event in table_events(snapshot) {
        if current != Some(&event.stream) {
            current = Some(&event.stream);
            pick = 0;
        }
        let Stream::Task(task) = &event.stream else {
            continue;
        };
        let Event::MutationRan(data) = &event.event else {
            continue;
        };
        pick += 1;
        tables.picks.push(MutationPickRow {
            change: snapshot.folder.clone(),
            task: task.as_str().to_owned(),
            pick,
            file: data.file.clone(),
            function: data.function.clone(),
            outcome: data.outcome.as_str().to_owned(),
            reason: data.reason.map(|reason| reason.as_str().to_owned()),
            killed: count_i64(data.killed),
            survived: count_i64(data.survived),
            invalid: count_i64(data.invalid),
            duration: number_f64(&data.duration),
            scenarios: data.scenarios.join("\n"),
        });
        if let Some(entries) = data.survivors.as_array() {
            for (index, entry) in entries.iter().enumerate() {
                tables
                    .survivors
                    .push(survivor_row(snapshot, task, pick, data, index, entry));
            }
        }
    }
    tables
}

/// One survivor entry, an object's fields or all nulls for anything else.
fn survivor_row(
    snapshot: &ChangeSnapshot,
    task: &TaskId,
    pick: i64,
    data: &osq_core::event::MutationRanData,
    index: usize,
    entry: &serde_json::Value,
) -> MutationSurvivorRow {
    let position = len_i64(index + 1);
    MutationSurvivorRow {
        id: format!("{}.{}.m{}.{}", snapshot.id, task, pick, position),
        change: snapshot.folder.clone(),
        task: task.as_str().to_owned(),
        pick,
        file: string_of(entry.get("file")),
        function: data.function.clone(),
        line: entry.get("line").and_then(serde_json::Value::as_f64),
        column: entry.get("column").and_then(serde_json::Value::as_f64),
        mutator: string_of(entry.get("mutator")),
        replacement: string_of(entry.get("replacement")),
    }
}
